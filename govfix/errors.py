from dataclasses import dataclass


@dataclass
class Refusal(Exception):
    code: str
    message: str
    status: int
    retry_after: int | None = None

    def response(self, request_id: str, case_version: int | None = None) -> dict:
        error = {"code": self.code, "message": self.message}
        if case_version is not None:
            error["case_version"] = case_version
        return {"error": error, "request_id": request_id}
