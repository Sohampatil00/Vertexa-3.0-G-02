"""Create three private ElevenLabs pilot agents; dry-run is the default."""

import argparse
import json
import os
from pathlib import Path

from elevenlabs.client import ElevenLabs
from elevenlabs.types import AgentPlatformSettingsRequestModel, ConversationalConfig

ROOT = Path(__file__).resolve().parents[1]
GREETINGS = {
    "en": "Hello. I can help prepare a grievance or check your case status. What do you need?",
    "hi": "नमस्ते। मैं शिकायत तैयार करने या आपकी शिकायत की स्थिति जानने में मदद कर सकता हूँ। आपको क्या चाहिए?",
    "mr": (
        "नमस्कार. मी तक्रार तयार करण्यासाठी किंवा तुमच्या तक्रारीची स्थिती तपासण्यासाठी "
        "मदत करू शकतो. तुम्हाला कोणती मदत हवी आहे?"
    ),
}


def tool(name, description, fields):
    return {
        "type": "client",
        "name": name,
        "description": description,
        "expects_response": True,
        "response_timeout_secs": 20,
        "parameters": {
            "type": "object",
            "properties": {
                name: {"type": "string", "description": description}
                for name, description in fields.items()
            },
            "required": list(fields),
        },
    }


def configuration(language, voice_id=None, llm=None):
    prompt = (ROOT / "config/voice/agent-prompt.txt").read_text()
    config = {
        "agent": {
            "language": language,
            "first_message": GREETINGS[language],
            "dynamic_variables": {
                "dynamic_variable_placeholders": {
                    "categories": "POTHOLE, MISSED_WASTE_COLLECTION",
                    "wards": "WARD-A, WARD-B",
                }
            },
            "prompt": {
                "prompt": prompt,
                "temperature": 0,
                "enable_parallel_tool_calls": False,
                "tools": [
                    tool(
                        "prepare_grievance",
                        "Prepare a draft for review; never submit.",
                        {
                            "description": "Citizen's complaint in their language",
                            "location": "Citizen-confirmed landmark or address",
                            "category": "Exact allowed category code",
                            "ward": "Exact citizen-selected ward code",
                        },
                    ),
                    tool(
                        "lookup_status",
                        "Read authenticated citizen case status.",
                        {"case_id": "Exact case reference, beginning GF-"},
                    ),
                ],
            },
        },
        "conversation": {
            "max_duration_seconds": 900,
            "client_events": [
                "audio",
                "interruption",
                "user_transcript",
                "agent_response",
                "client_tool_call",
            ],
        },
    }
    if voice_id:
        config["tts"] = {"voice_id": voice_id}
    if llm:
        config["agent"]["prompt"]["llm"] = llm
    platform = {
        "auth": {"enable_auth": True},
        "call_limits": {"agent_concurrency_limit": 3, "daily_limit": 100},
        "privacy": {
            "record_voice": False,
            "retention_days": 7,
            "delete_audio": True,
            "delete_transcript_and_pii": True,
        },
    }
    # Validate against the installed SDK before any account mutation.
    ConversationalConfig.model_validate(config)
    AgentPlatformSettingsRequestModel.model_validate(platform)
    return {
        "name": f"GovFix Phase 5 {language}",
        "conversation_config": config,
        "platform_settings": platform,
        "tags": ["govfix", "demo", "phase5"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="Create agents in the connected account"
    )
    parser.add_argument(
        "--update",
        action="store_true",
        help="Update existing agents with latest prompt and configuration",
    )
    parser.add_argument("--voice-id", default=os.getenv("GOVFIX_ELEVENLABS_VOICE_ID"))
    parser.add_argument("--llm", default=os.getenv("GOVFIX_ELEVENLABS_LLM"))
    args = parser.parse_args()
    configs = {language: configuration(language, args.voice_id, args.llm) for language in GREETINGS}
    if not args.apply and not args.update:
        print(json.dumps(configs, ensure_ascii=False, indent=2))
        return
    if not os.getenv("ELEVENLABS_API_KEY") or (not args.voice_id and not args.update):
        parser.error("Set ELEVENLABS_API_KEY and provide an account voice ID before applying")
    client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"], timeout=20)
    existing, cursor = {}, None
    while True:
        page = client.conversational_ai.agents.list(cursor=cursor, page_size=100)
        existing.update({agent.name: agent.agent_id for agent in page.agents})
        if not page.has_more:
            break
        cursor = page.next_cursor
    for language, config in configs.items():
        name = config["name"]
        agent_id = existing.get(name)
        if agent_id:
            if args.update:
                client.conversational_ai.agents.update(
                    agent_id=agent_id,
                    conversation_config=config["conversation_config"],
                    platform_settings=config["platform_settings"],
                )
                print(f"Updated {name}: {agent_id} with prompt and language config.")
            else:
                client.conversational_ai.agents.get(agent_id)
                print(f"Existing {name}: {agent_id}; configuration preserved.")
        else:
            agent_id = client.conversational_ai.agents.create(**config).agent_id
            client.conversational_ai.agents.get(agent_id)
        print(f"GOVFIX_ELEVENLABS_AGENT_{language.upper()}={agent_id}")


if __name__ == "__main__":
    main()
