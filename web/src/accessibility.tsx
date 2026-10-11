import { useEffect, useState } from "react";
import { demoCopy } from "./demoCopy";

export type PageLanguage = "en" | "hi" | "mr";

const languageKey = "govfix-page-language";
const contrastKey = "govfix-high-contrast";

// Only application copy belongs here. Translation stays in the browser and uses
// exact known UI phrases; it never sends case details to a translation service.
const copy: Record<string, [string, string]> = {
  ...demoCopy,
  "GovFix Municipal Operations": [
    "गोवफिक्स नगरपालिका संचालन",
    "गोवफिक्स नगरपालिका कामकाज",
  ],
  "Fictional Demo Municipality": [
    "काल्पनिक डेमो नगर पालिका",
    "काल्पनिक प्रात्यक्षिक नगरपालिका",
  ],
  "GovFix Central Grievance Dispatch & Public SLA Engine": [
    "गोवफिक्स केंद्रीय शिकायत प्रबंधन और सार्वजनिक समय-सीमा प्रणाली",
    "गोवफिक्स केंद्रीय तक्रार व्यवस्थापन आणि सार्वजनिक वेळमर्यादा प्रणाली",
  ],
  "Deterministic Grievance State Machine & Public SLA Engine": [
    "नियम आधारित शिकायत प्रक्रिया और सार्वजनिक समय-सीमा प्रणाली",
    "नियमाधारित तक्रार प्रक्रिया आणि सार्वजनिक वेळमर्यादा प्रणाली",
  ],
  Demo: ["डेमो", "प्रात्यक्षिक"],
  "Demo policy": ["डेमो नीति", "प्रात्यक्षिक धोरण"],
  "Statutory Access Portal": ["आधिकारिक प्रवेश पोर्टल", "अधिकृत प्रवेश पोर्टल"],
  "Sign in to GovFix": ["गोवफिक्स में प्रवेश करें", "गोवफिक्समध्ये प्रवेश करा"],
  "Authenticate using pilot citizen, officer, or auditor credentials.": [
    "पायलट नागरिक, अधिकारी या लेखा परीक्षक के खाते से प्रवेश करें।",
    "प्रायोगिक नागरिक, अधिकारी किंवा लेखापरीक्षक खात्याने प्रवेश करा.",
  ],
  Username: ["उपयोगकर्ता नाम", "वापरकर्तानाव"],
  Password: ["पासवर्ड", "संकेतशब्द"],
  "e.g. pilot-citizen or pilot-auditor": [
    "जैसे pilot-citizen या pilot-auditor",
    "उदा. pilot-citizen किंवा pilot-auditor",
  ],
  "Authenticating…": ["प्रवेश की जाँच जारी…", "प्रवेश तपासत आहे…"],
  "Sign in to Operations": ["संचालन में प्रवेश करें", "कामकाजात प्रवेश करा"],
  "Sign out": ["बाहर निकलें", "बाहेर पडा"],
  "Sign out of GovFix": ["गोवफिक्स से बाहर निकलें", "गोवफिक्समधून बाहेर पडा"],
  "Citizen:": ["नागरिक:", "नागरिक:"],
  "Officer / Supervisor:": ["अधिकारी / पर्यवेक्षक:", "अधिकारी / पर्यवेक्षक:"],
  "Auditor:": ["लेखा परीक्षक:", "लेखापरीक्षक:"],
  "submit grievances, track SLA, verify resolution": [
    "शिकायत दर्ज करें, समय-सीमा देखें, समाधान की पुष्टि करें",
    "तक्रार नोंदवा, वेळमर्यादा पाहा, निराकरणाची खात्री करा",
  ],
  "triage, dispatch, execute, rework": [
    "जाँच, आवंटन, कार्य और दोबारा कार्य",
    "छाननी, वाटप, काम आणि पुनर्काम",
  ],
  "inspect immutable governance ledger": [
    "अपरिवर्तनीय अभिलेख देखें",
    "अपरिवर्तनीय नोंदी पाहा",
  ],
  "Notifications & SLA Alerts": [
    "सूचनाएँ और समय-सीमा चेतावनियाँ",
    "सूचना आणि वेळमर्यादा इशारे",
  ],
  "Ward A & B • Operations": [
    "वार्ड A और B • संचालन",
    "प्रभाग A आणि B • कामकाज",
  ],
  "Role Switch Sandbox": ["भूमिका बदलें", "भूमिका बदला"],
  "Switch dashboard": ["डैशबोर्ड बदलें", "डॅशबोर्ड बदला"],
  "Dashboard navigation": ["डैशबोर्ड नेविगेशन", "डॅशबोर्ड नेव्हिगेशन"],
  "Citizen Overview": ["नागरिक अवलोकन", "नागरिक आढावा"],
  "Intake Queue": ["प्राप्त शिकायतें", "आलेल्या तक्रारी"],
  Dispatcher: ["कार्य आवंटन", "काम वाटप"],
  "Field Officer": ["क्षेत्र अधिकारी", "क्षेत्र अधिकारी"],
  "Supervisor Queue": ["पर्यवेक्षक कतार", "पर्यवेक्षक रांग"],
  "Ward Head Oversight": ["वार्ड प्रमुख निगरानी", "प्रभाग प्रमुख देखरेख"],
  "Auditor Portal": ["लेखा परीक्षक पोर्टल", "लेखापरीक्षक पोर्टल"],
  Notifications: ["सूचनाएँ", "सूचना"],
  Citizen: ["नागरिक", "नागरिक"],
  "Intake Officer": ["प्रवेश अधिकारी", "स्वीकृती अधिकारी"],
  "Field Crew": ["क्षेत्र दल", "क्षेत्र पथक"],
  Supervisor: ["पर्यवेक्षक", "पर्यवेक्षक"],
  "Ward Executive": ["वार्ड कार्यकारी", "प्रभाग कार्यकारी"],
  "Governance & Audit": ["प्रशासन और लेखा परीक्षा", "प्रशासन आणि लेखापरीक्षण"],
  "SLA Alerts": ["समय-सीमा चेतावनियाँ", "वेळमर्यादा इशारे"],
  "Node Active": ["प्रणाली सक्रिय", "प्रणाली सक्रिय"],
  "Welcome back,": ["फिर से स्वागत है,", "पुन्हा स्वागत आहे,"],
  "Registered Citizen Profile • Municipal Grievance Tracking & Verification Portal":
    [
      "पंजीकृत नागरिक • नगरपालिका शिकायत और पुष्टि पोर्टल",
      "नोंदणीकृत नागरिक • नगरपालिका तक्रार आणि पडताळणी पोर्टल",
    ],
  "Voice Grievance": ["आवाज़ से शिकायत", "आवाजाद्वारे तक्रार"],
  "Hide Voice Assistant": ["आवाज़ सहायक छिपाएँ", "आवाज सहाय्यक लपवा"],
  "Report New Grievance": ["नई शिकायत दर्ज करें", "नवीन तक्रार नोंदवा"],
  "Refresh cases": ["शिकायतें फिर लाएँ", "तक्रारी पुन्हा आणा"],
  "Action Required": ["कार्रवाई आवश्यक", "कारवाई आवश्यक"],
  "Awaiting Your Verification": [
    "आपकी पुष्टि की प्रतीक्षा",
    "तुमच्या पडताळणीची प्रतीक्षा",
  ],
  "Case(s) awaiting your review": [
    "आपकी समीक्षा के लिए शिकायतें",
    "तुमच्या पाहणीसाठी तक्रारी",
  ],
  "Confirm or dispute resolution": [
    "समाधान स्वीकारें या चुनौती दें",
    "निराकरण स्वीकारा किंवा आक्षेप घ्या",
  ],
  "Active Dispatch": ["सक्रिय कार्य", "सुरू असलेली कामे"],
  "In Progress & Assigned": [
    "चल रहा और आवंटित कार्य",
    "चालू आणि वाटप केलेली कामे",
  ],
  "Active municipal work orders": [
    "सक्रिय नगरपालिका कार्य आदेश",
    "सक्रिय नगरपालिका कार्यादेश",
  ],
  "Under municipal SLA": [
    "नगरपालिका समय-सीमा के अंतर्गत",
    "नगरपालिका वेळमर्यादेत",
  ],
  Active: ["सक्रिय", "सक्रिय"],
  "Historical Archive": ["पुराने अभिलेख", "मागील नोंदी"],
  "Completed & Closed": ["पूर्ण और बंद", "पूर्ण आणि बंद"],
  "Resolved grievances": ["निराकृत शिकायतें", "निकाली तक्रारी"],
  "Immediate Action Required": [
    "तुरंत कार्रवाई आवश्यक",
    "तातडीची कारवाई आवश्यक",
  ],
  "1 Case Awaiting Citizen Verification": [
    "1 शिकायत नागरिक की पुष्टि की प्रतीक्षा में",
    "1 तक्रार नागरिक पडताळणीच्या प्रतीक्षेत",
  ],
  "Resolution Submitted": ["समाधान प्रस्तुत", "निराकरण सादर"],
  "Inspect Full Evidence": ["सारे सबूत देखें", "सर्व पुरावे पाहा"],
  "My Registered Grievances": [
    "मेरी दर्ज शिकायतें",
    "माझ्या नोंदवलेल्या तक्रारी",
  ],
  "No grievances registered": [
    "कोई शिकायत दर्ज नहीं",
    "अजून तक्रार नोंदलेली नाही",
  ],
  "You haven't reported any municipal grievances yet. Click below to submit your first case.":
    [
      "आपने अभी तक कोई शिकायत दर्ज नहीं की है। पहली शिकायत दर्ज करने के लिए नीचे क्लिक करें।",
      "तुम्ही अजून तक्रार नोंदवलेली नाही. पहिली तक्रार करण्यासाठी खाली क्लिक करा.",
    ],
  "My grievances": ["मेरी शिकायतें", "माझ्या तक्रारी"],
  "Your reports, progress and resolution decisions in one place.": [
    "आपकी शिकायतें, प्रगति और समाधान के निर्णय एक जगह।",
    "तुमच्या तक्रारी, प्रगती आणि निराकरणाचे निर्णय एकाच ठिकाणी.",
  ],
  "New grievance": ["नई शिकायत", "नवीन तक्रार"],
  "Report New Municipal Grievance": [
    "नई नगरपालिका शिकायत दर्ज करें",
    "नवीन नगरपालिका तक्रार नोंदवा",
  ],
  "Describe the issue and confirm the details before submission.": [
    "समस्या का विवरण दें और जमा करने से पहले जानकारी जाँचें।",
    "समस्या सांगा आणि सादर करण्यापूर्वी तपशील तपासा.",
  ],
  "Grievance Category": ["शिकायत का प्रकार", "तक्रारीचा प्रकार"],
  "Ward Jurisdiction": ["वार्ड क्षेत्र", "प्रभाग क्षेत्र"],
  "Location Details": ["स्थान का विवरण", "ठिकाणाचा तपशील"],
  "Detailed Description": ["विस्तृत विवरण", "सविस्तर वर्णन"],
  "e.g. Ward A, Sector 4, 3rd Crossroad": [
    "जैसे वार्ड A, सेक्टर 4, तीसरा चौराहा",
    "उदा. प्रभाग A, सेक्टर 4, तिसरा चौक",
  ],
  "Describe the civic issue accurately for dispatch triage...": [
    "समस्या का सही विवरण दें ताकि कार्य आवंटित हो सके...",
    "कामाचे वाटप व्हावे म्हणून समस्या अचूक सांगा...",
  ],
  "I confirm that these details accurately describe my grievance.": [
    "मैं पुष्टि करता/करती हूँ कि यह विवरण मेरी शिकायत को सही बताता है।",
    "हे तपशील माझी तक्रार अचूक सांगतात याची मी खात्री करतो/करते.",
  ],
  Cancel: ["रद्द करें", "रद्द करा"],
  "Submitting Case…": ["शिकायत जमा हो रही है…", "तक्रार सादर होत आहे…"],
  "Submit & Generate Case ID": [
    "जमा करें और शिकायत क्रमांक पाएँ",
    "सादर करा आणि तक्रार क्रमांक मिळवा",
  ],
  Close: ["बंद करें", "बंद करा"],
  "Close new grievance": ["नई शिकायत बंद करें", "नवीन तक्रार बंद करा"],
  "Close modal": ["संवाद बंद करें", "संवाद बंद करा"],
  "Case ID": ["शिकायत क्रमांक", "तक्रार क्रमांक"],
  Case: ["शिकायत", "तक्रार"],
  "Location:": ["स्थान:", "ठिकाण:"],
  "Assigned Department": ["नियुक्त विभाग", "नियुक्त विभाग"],
  "Assigned Officer": ["नियुक्त अधिकारी", "नियुक्त अधिकारी"],
  "Workflow State": ["प्रक्रिया स्थिति", "प्रक्रिया स्थिती"],
  "SLA Deadline": ["समय-सीमा", "वेळमर्यादा"],
  "SLA Condition": ["समय-सीमा स्थिति", "वेळमर्यादा स्थिती"],
  Evidence: ["सबूत", "पुरावे"],
  "Audit Timeline": ["कार्रवाई का रिकॉर्ड", "कारवाईची नोंद"],
  "Refresh case": ["शिकायत फिर लाएँ", "तक्रार पुन्हा आणा"],
  "Review & Verify Resolution": [
    "समाधान की समीक्षा और पुष्टि करें",
    "निराकरण पाहा आणि खात्री करा",
  ],
  "Accept & Close Case": [
    "स्वीकारें और शिकायत बंद करें",
    "स्वीकारा आणि तक्रार बंद करा",
  ],
  "Dispute / Report Incomplete": [
    "आपत्ति करें / अधूरा काम बताएँ",
    "आक्षेप घ्या / अपूर्ण काम कळवा",
  ],
  "Dispute Resolution": ["समाधान पर आपत्ति", "निराकरणावर आक्षेप"],
  "Keep case open": ["शिकायत खुली रखें", "तक्रार उघडी ठेवा"],
  Confirm: ["पुष्टि करें", "खात्री करा"],
  "Review your grievance": ["अपनी शिकायत जाँचें", "तुमची तक्रार तपासा"],
  "Voice assistance": ["आवाज़ सहायता", "आवाज सहाय्य"],
  "Voice language": ["आवाज़ की भाषा", "आवाजाची भाषा"],
  English: ["अंग्रेज़ी", "इंग्रजी"],
  Hindi: ["हिन्दी", "हिंदी"],
  Marathi: ["मराठी", "मराठी"],
  "Start voice": ["बोलना शुरू करें", "बोलणे सुरू करा"],
  "Stop voice and review": ["आवाज़ रोकें और जाँचें", "बोलणे थांबवा आणि तपासा"],
  "Discard voice session": ["आवाज़ सत्र हटाएँ", "आवाज सत्र काढून टाका"],
  "Conversation transcript": ["बातचीत का पाठ", "संभाषणाचा मजकूर"],
  "Submit grievance": ["शिकायत जमा करें", "तक्रार सादर करा"],
  "Confirm voice grievance": [
    "आवाज़ शिकायत की पुष्टि करें",
    "आवाज तक्रारीची खात्री करा",
  ],
  "No notifications recorded": [
    "कोई सूचना दर्ज नहीं",
    "कोणतीही सूचना नोंदलेली नाही",
  ],
  "Loading notifications…": ["सूचनाएँ लोड हो रही हैं…", "सूचना लोड होत आहेत…"],
  "Inspect Case": ["शिकायत देखें", "तक्रार पाहा"],
  Refresh: ["फिर लाएँ", "पुन्हा आणा"],
  "Loading case telemetry and operations…": [
    "शिकायत की जानकारी लोड हो रही है…",
    "तक्रारीची माहिती लोड होत आहे…",
  ],
  "Loading notification events…": [
    "सूचनाएँ लोड हो रही हैं…",
    "सूचना लोड होत आहेत…",
  ],
  "System readiness": ["प्रणाली की तैयारी", "प्रणालीची तयारी"],
  "Policy reference": ["नीति विवरण", "धोरण संदर्भ"],
  "Configured wards": ["निर्धारित वार्ड", "निश्चित प्रभाग"],
  "Categories and evidence rules": [
    "प्रकार और सबूत के नियम",
    "प्रकार आणि पुराव्याचे नियम",
  ],
  "Rejection reason codes": ["अस्वीकृति के कारण", "नकाराची कारणे"],
  "Intake queue is clear": [
    "प्राप्त शिकायतों की कतार खाली है",
    "आलेल्या तक्रारींची रांग रिकामी आहे",
  ],
  "Municipal Intake Queue": [
    "नगरपालिका शिकायत प्राप्ति कतार",
    "नगरपालिका तक्रार स्वीकृती रांग",
  ],
  "Pending Validation": ["जाँच की प्रतीक्षा", "तपासणीच्या प्रतीक्षेत"],
  "Pending Triage Queue (": ["प्रारंभिक जाँच कतार (", "प्राथमिक छाननी रांग ("],
  "Select a case from queue to validate": [
    "जाँच के लिए कतार से शिकायत चुनें",
    "तपासणीसाठी रांगेतून तक्रार निवडा",
  ],
  "Validation queue": ["जाँच कतार", "तपासणी रांग"],
  "Validation Active": ["जाँच जारी", "तपासणी सुरू"],
  "Validate & Advance to Dispatch": [
    "जाँचें और कार्य आवंटन को भेजें",
    "तपासा आणि काम वाटपासाठी पाठवा",
  ],
  "Reject with Coded Reason": [
    "कारण दर्ज कर अस्वीकार करें",
    "कारण नोंदवून नकार द्या",
  ],
  "Reject Case with Audit Trail": [
    "रिकॉर्ड सहित शिकायत अस्वीकार करें",
    "नोंदीसह तक्रार नाकारा",
  ],
  "Confirm validation of this case under": [
    "इस नियम के अंतर्गत शिकायत की जाँच की पुष्टि करें",
    "या नियमानुसार तक्रारीची तपासणी निश्चित करा",
  ],
  "Confirm Rejection": ["अस्वीकृति की पुष्टि करें", "नकाराची खात्री करा"],
  "Rejection Reason Code": ["अस्वीकृति कारण कोड", "नकाराचे कारण संकेत"],
  "Reason Code": ["कारण कोड", "कारण संकेत"],
  "Explain reason for rejection...": [
    "अस्वीकृति का कारण बताएँ...",
    "नकाराचे कारण सांगा...",
  ],
  "Dispatcher Operations — Validated Cases Awaiting Officer Assignment": [
    "कार्य आवंटन — जाँची गई शिकायतों को अधिकारी की प्रतीक्षा",
    "काम वाटप — तपासलेल्या तक्रारी अधिकारी वाटपाच्या प्रतीक्षेत",
  ],
  "Validated Awaiting Assignment": [
    "जाँची गईं, आवंटन की प्रतीक्षा",
    "तपासलेल्या, वाटपाच्या प्रतीक्षेत",
  ],
  "No validated cases awaiting assignment": [
    "आवंटन के लिए कोई जाँची गई शिकायत नहीं",
    "वाटपासाठी तपासलेली तक्रार नाही",
  ],
  "Assign to Officer": ["अधिकारी को सौंपें", "अधिकाऱ्याला सोपवा"],
  "Assign validated cases to eligible department officers in designated ward. Reassignment or SLA extension requires Supervisor privileges.":
    [
      "जाँची गई शिकायतें वार्ड के योग्य अधिकारियों को सौंपें। पुनः आवंटन या समय-सीमा बढ़ाने के लिए पर्यवेक्षक अधिकार चाहिए।",
      "तपासलेल्या तक्रारी प्रभागातील पात्र अधिकाऱ्यांना सोपवा. पुनर्वाटप किंवा वेळ वाढवण्यासाठी पर्यवेक्षक अधिकार आवश्यक आहेत.",
    ],
  "Assignment Reason / Work Order Memo": [
    "आवंटन का कारण / कार्य निर्देश",
    "वाटपाचे कारण / कामाचा आदेश",
  ],
  "Dispatch & Bind Assignment": ["कार्य आवंटित करें", "काम वाटप करा"],
  "Dispatch Reason": ["आवंटन का कारण", "वाटपाचे कारण"],
  "Enter dispatch assignment reason...": [
    "कार्य आवंटन का कारण लिखें...",
    "काम वाटपाचे कारण लिहा...",
  ],
  "Available Officers in Roster": ["उपलब्ध अधिकारी", "उपलब्ध अधिकारी"],
  "Select Field Officer in Department": [
    "विभाग का क्षेत्र अधिकारी चुनें",
    "विभागातील क्षेत्र अधिकारी निवडा",
  ],
  "Select officer": ["अधिकारी चुनें", "अधिकारी निवडा"],
  "Select to assign": ["आवंटन के लिए चुनें", "वाटपासाठी निवडा"],
  "Field Operations Console": [
    "क्षेत्र कार्य नियंत्रण",
    "क्षेत्र काम नियंत्रण",
  ],
  "Field Work Orders": ["क्षेत्र कार्य आदेश", "क्षेत्र कार्यादेश"],
  "My work": ["मेरा कार्य", "माझे काम"],
  "Your assignments, field work and evidence of completion.": [
    "आपके सौंपे गए कार्य, क्षेत्र कार्य और पूरा होने के सबूत।",
    "तुमच्याकडे सोपवलेली कामे, क्षेत्र काम आणि पूर्णत्वाचे पुरावे.",
  ],
  "No active work orders": [
    "कोई सक्रिय कार्य आदेश नहीं",
    "कोणताही सक्रिय कार्यादेश नाही",
  ],
  "Accept Assignment": ["कार्य स्वीकारें", "काम स्वीकारा"],
  "Accept assignments": ["सौंपे गए कार्य स्वीकारें", "सोपवलेली कामे स्वीकारा"],
  "I accept ownership and commit to executing this grievance work order.": [
    "मैं यह कार्य स्वीकार करता/करती हूँ और इसे पूरा करने का वचन देता/देती हूँ।",
    "मी हे काम स्वीकारतो/स्वीकारते आणि ते पूर्ण करण्याची जबाबदारी घेतो/घेते.",
  ],
  "Upload Evidence": ["सबूत अपलोड करें", "पुरावा अपलोड करा"],
  "Upload Ground Evidence Photo": [
    "काम की तस्वीर अपलोड करें",
    "कामाचा फोटो अपलोड करा",
  ],
  "Resolution photo": ["समाधान की तस्वीर", "निराकरणाचा फोटो"],
  "No evidence uploaded yet.": [
    "अभी कोई सबूत अपलोड नहीं हुआ।",
    "अजून कोणताही पुरावा अपलोड झालेला नाही.",
  ],
  "Work Completed Description": [
    "किए गए कार्य का विवरण",
    "पूर्ण केलेल्या कामाचा तपशील",
  ],
  "Describe the physical repair or sanitation work performed...": [
    "किए गए मरम्मत या सफाई कार्य का विवरण दें...",
    "केलेल्या दुरुस्ती किंवा स्वच्छतेच्या कामाचे वर्णन करा...",
  ],
  "Submit resolution": ["समाधान प्रस्तुत करें", "निराकरण सादर करा"],
  "Field Resolution Submitted": [
    "क्षेत्र समाधान प्रस्तुत",
    "क्षेत्र निराकरण सादर",
  ],
  "Supervisor Escalation & Dispute Queue": [
    "पर्यवेक्षक वृद्धि और आपत्ति कतार",
    "पर्यवेक्षक वाढ आणि आक्षेप रांग",
  ],
  "Ward Operations & Supervisor Oversight": [
    "वार्ड संचालन और पर्यवेक्षक निगरानी",
    "प्रभाग कामकाज आणि पर्यवेक्षक देखरेख",
  ],
  "Overdue cases": ["समय-सीमा पार शिकायतें", "वेळमर्यादा ओलांडलेल्या तक्रारी"],
  "Overdue assignments": [
    "समय-सीमा पार आवंटन",
    "वेळमर्यादा ओलांडलेली वाटप कामे",
  ],
  "Disputes / Reviews": ["आपत्तियाँ / समीक्षाएँ", "आक्षेप / पुनरावलोकने"],
  "Dispute review": ["आपत्ति की समीक्षा", "आक्षेपाचे पुनरावलोकन"],
  "No active disputes in queue": [
    "कतार में कोई सक्रिय आपत्ति नहीं",
    "रांगेत कोणताही सक्रिय आक्षेप नाही",
  ],
  "Reassign to Another Officer": [
    "दूसरे अधिकारी को सौंपें",
    "दुसऱ्या अधिकाऱ्याला सोपवा",
  ],
  "Retain Current Officer": [
    "वर्तमान अधिकारी बनाए रखें",
    "सध्याचाच अधिकारी ठेवा",
  ],
  "Rework Officer": ["दोबारा कार्य के लिए अधिकारी", "पुनर्कामासाठी अधिकारी"],
  "Reason for Extension": ["समय बढ़ाने का कारण", "वेळवाढीचे कारण"],
  "New SLA Deadline": ["नई समय-सीमा", "नवी वेळमर्यादा"],
  "Confirm extension": ["समय बढ़ाने की पुष्टि करें", "वेळवाढ निश्चित करा"],
  "The revised deadline and reason will be recorded in the audit timeline.": [
    "बदली हुई समय-सीमा और कारण कार्रवाई रिकॉर्ड में दर्ज होंगे।",
    "बदललेली वेळमर्यादा आणि कारण कारवाईच्या नोंदीत जतन होतील.",
  ],
  "Auditor dashboard": ["लेखा परीक्षा डैशबोर्ड", "लेखापरीक्षण डॅशबोर्ड"],
  "Case audit register": ["शिकायत कार्रवाई रजिस्टर", "तक्रार कारवाई नोंदवही"],
  "Read-Only Governance Rail": [
    "केवल पढ़ने योग्य प्रशासन रिकॉर्ड",
    "फक्त वाचनासाठी प्रशासन नोंद",
  ],
  "READ-ONLY OVERSIGHT": ["केवल पढ़ने योग्य निगरानी", "फक्त वाचनासाठी देखरेख"],
  "Audit Action": ["कार्रवाई रिकॉर्ड", "कारवाई नोंद"],
  "Audit Timeline (": ["कार्रवाई क्रम (", "कारवाई क्रम ("],
  "Actor:": ["कर्ताः", "कर्ता:"],
  "Reason:": ["कारण:", "कारण:"],
  Download: ["डाउनलोड करें", "डाउनलोड करा"],
  "Downloading…": ["डाउनलोड हो रहा है…", "डाउनलोड होत आहे…"],
  Total: ["कुल", "एकूण"],
  Overdue: ["समय-सीमा पार", "वेळमर्यादा उलटली"],
  Pending: ["लंबित", "प्रलंबित"],
  Submitted: ["दर्ज", "नोंदवलेली"],
  Validated: ["जाँची गई", "तपासलेली"],
  Assigned: ["सौंपा गया", "वाटप केलेली"],
  "In Progress": ["कार्य जारी", "काम सुरू"],
  Closed: ["बंद", "बंद"],
  Rejected: ["अस्वीकृत", "नाकारलेली"],
  Disputed: ["आपत्ति दर्ज", "आक्षेप नोंदवलेला"],
  "Supervisor Review": ["पर्यवेक्षक समीक्षा", "पर्यवेक्षक पुनरावलोकन"],
  "Citizen Verification": ["नागरिक पुष्टि", "नागरिक पडताळणी"],
  "Refresh queue": ["कतार फिर लाएँ", "रांग पुन्हा आणा"],
  "Search Case ID or street location...": [
    "शिकायत क्रमांक या सड़क खोजें...",
    "तक्रार क्रमांक किंवा रस्ता शोधा...",
  ],
  "All Categories": ["सभी प्रकार", "सर्व प्रकार"],
  "All Wards (": ["सभी वार्ड (", "सर्व प्रभाग ("],
  "All Ward Cases (": ["सभी वार्ड शिकायतें (", "सर्व प्रभाग तक्रारी ("],
  "All scoped cases": ["सभी अनुमत शिकायतें", "सर्व परवानगीच्या तक्रारी"],
  "Your own grievances": ["आपकी अपनी शिकायतें", "तुमच्या स्वतःच्या तक्रारी"],
  "Needs attention": ["ध्यान आवश्यक", "लक्ष आवश्यक"],
  "Unanswered verification": [
    "पुष्टि का उत्तर नहीं मिला",
    "पडताळणीचे उत्तर नाही",
  ],
  "Notification delivery": ["सूचना भेजना", "सूचना पाठवणे"],
  "Delivery backlog:": ["लंबित सूचनाएँ:", "प्रलंबित सूचना:"],
  "Worker:": ["कार्य प्रणाली:", "कार्य प्रणाली:"],
  "Recent successful cycle": ["हाल का सफल चक्र", "अलीकडील यशस्वी फेरी"],
  "Refresh system status": [
    "प्रणाली स्थिति फिर लाएँ",
    "प्रणाली स्थिती पुन्हा आणा",
  ],
  "SLA Notifications & Operational Broadcasts": [
    "समय-सीमा सूचनाएँ और संचालन संदेश",
    "वेळमर्यादा सूचना आणि कामकाज संदेश",
  ],
  "Statutory notices will appear here as cases cross SLA thresholds.": [
    "शिकायतें समय-सीमा पार करेंगी तो सूचनाएँ यहाँ दिखेंगी।",
    "तक्रारी वेळमर्यादा ओलांडल्यावर सूचना येथे दिसतील.",
  ],
  "100% verified resolution track": [
    "पूरी तरह सत्यापित समाधान प्रक्रिया",
    "पूर्णपणे पडताळलेली निराकरण प्रक्रिया",
  ],
  "100% Certified": ["पूरी तरह प्रमाणित", "पूर्णपणे प्रमाणित"],
  "100% Citizen Sign-Off": ["नागरिक की पूरी पुष्टि", "नागरिकाची पूर्ण खात्री"],
  "100% SLA Compliant": ["पूरी तरह समय-सीमा के भीतर", "पूर्णपणे वेळमर्यादेत"],
  "A supervisor has been alerted to the wait.": [
    "प्रतीक्षा के बारे में पर्यवेक्षक को सूचना दी गई है।",
    "प्रतीक्षेबाबत पर्यवेक्षकाला कळवले आहे.",
  ],
  "Active Dispute Review Rail": [
    "सक्रिय आपत्ति समीक्षा",
    "सक्रिय आक्षेप पुनरावलोकन",
  ],
  "Active Ward Scope": ["सक्रिय वार्ड क्षेत्र", "सक्रिय प्रभाग क्षेत्र"],
  "All grievances are running on schedule with zero unhandled citizen disputes.":
    [
      "सभी शिकायतें समय पर हैं और कोई नागरिक आपत्ति लंबित नहीं है।",
      "सर्व तक्रारी वेळेत आहेत आणि कोणताही नागरिक आक्षेप प्रलंबित नाही.",
    ],
  "All validated cases have been assigned to field officers or await intake validation.":
    [
      "सभी जाँची गई शिकायतें क्षेत्र अधिकारियों को सौंपी गई हैं या प्रारंभिक जाँच में हैं।",
      "सर्व तपासलेल्या तक्रारी क्षेत्र अधिकाऱ्यांना दिल्या आहेत किंवा प्राथमिक तपासणीत आहेत.",
    ],
  "Arbitrate / Rework": ["निर्णय / दोबारा काम", "निर्णय / पुनर्काम"],
  "Ask the assistant to correct any mistakes before stopping voice. This draft has not been submitted.":
    [
      "आवाज़ रोकने से पहले सहायक से गलतियाँ ठीक कराएँ। यह मसौदा अभी जमा नहीं हुआ है।",
      "बोलणे थांबवण्यापूर्वी सहाय्यकाकडून चुका दुरुस्त करून घ्या. हा मसुदा अजून सादर झालेला नाही.",
    ],
  "Assigned Dept": ["नियुक्त विभाग", "नियुक्त विभाग"],
  "Assigned cases require explicit field acceptance, photo upload evidence of work, and resolution notes before citizen inspection.":
    [
      "सौंपी गई शिकायतों के लिए अधिकारी की स्वीकृति, कार्य का फोटो सबूत और समाधान विवरण आवश्यक है।",
      "वाटप केलेल्या तक्रारींसाठी अधिकाऱ्याची स्वीकृती, कामाचा फोटो पुरावा आणि निराकरण नोंद आवश्यक आहे.",
    ],
  "Attempts:": ["प्रयास:", "प्रयत्न:"],
  "Audited Explanation": ["दर्ज स्पष्टीकरण", "नोंदवलेले स्पष्टीकरण"],
  "Authorized Next Actions": [
    "अनुमत अगली कार्रवाई",
    "परवानगीच्या पुढील कारवाया",
  ],
  "Awaiting citizen sign-off": [
    "नागरिक की पुष्टि की प्रतीक्षा",
    "नागरिकाच्या खात्रीची प्रतीक्षा",
  ],
  "Case awaiting citizen verification sign-off.": [
    "शिकायत नागरिक की पुष्टि की प्रतीक्षा में है।",
    "तक्रार नागरिकाच्या पडताळणीच्या प्रतीक्षेत आहे.",
  ],
  "Checking system status…": [
    "प्रणाली की स्थिति जाँच रहे हैं…",
    "प्रणालीची स्थिती तपासत आहे…",
  ],
  "Citizen Dispute Statement": ["नागरिक की आपत्ति", "नागरिकाचा आक्षेप"],
  "Citizen Grievance Statement": [
    "नागरिक शिकायत विवरण",
    "नागरिक तक्रार निवेदन",
  ],
  "Civic SLA Node: Ward Operations": [
    "समय-सीमा प्रणाली: वार्ड संचालन",
    "वेळमर्यादा प्रणाली: प्रभाग कामकाज",
  ],
  "Closed Certifications": ["बंद किए गए मामले", "बंद झालेल्या नोंदी"],
  "Command console for": ["कार्रवाई नियंत्रण:", "कारवाई नियंत्रण:"],
  "Configured Wards": ["निर्धारित वार्ड", "निश्चित प्रभाग"],
  "Cryptographic Evidence Files": [
    "सुरक्षित सबूत फ़ाइलें",
    "सुरक्षित पुरावा फाइल्स",
  ],
  "Cryptographic Ward Ledger & Cases Breakdown": [
    "वार्ड रिकॉर्ड और शिकायत विवरण",
    "प्रभाग नोंदी आणि तक्रारींचा तपशील",
  ],
  "Current SLA Deadline": ["वर्तमान समय-सीमा", "सध्याची वेळमर्यादा"],
  "Demo policy active •": ["डेमो नीति सक्रिय •", "प्रात्यक्षिक धोरण सक्रिय •"],
  "Deployment:": ["तैनाती:", "तैनाती:"],
  "Dept:": ["विभाग:", "विभाग:"],
  "Describe a grievance or ask for the status of your case. Voice needs a verified citizen account. You can always use Report New Grievance to submit by text.":
    [
      "शिकायत बताएँ या उसकी स्थिति पूछें। आवाज़ सेवा के लिए सत्यापित नागरिक खाता चाहिए। लिखकर शिकायत दर्ज करने का विकल्प हमेशा उपलब्ध है।",
      "तक्रार सांगा किंवा तिची स्थिती विचारा. आवाज सेवेसाठी पडताळलेले नागरिक खाते आवश्यक आहे. लेखी तक्रार नोंदवण्याचा पर्याय नेहमी उपलब्ध आहे.",
    ],
  Details: ["विवरण", "तपशील"],
  "Dictation language": ["बोलकर लिखने की भाषा", "बोलून लिहिण्याची भाषा"],
  "Dispatched:": ["भेजा गया:", "पाठवले:"],
  "Dispatcher:": ["कार्य आवंटक:", "काम वाटप अधिकारी:"],
  "Due:": ["अंतिम समय:", "अंतिम वेळ:"],
  "Escalation level": ["वृद्धि स्तर", "वाढीची पातळी"],
  "Every grievance has an assigned municipal department, a deterministic SLA deadline in Asia/Kolkata timezone, and a verifiable resolution audit trail. You hold the final sign-off.":
    [
      "हर शिकायत का एक जिम्मेदार विभाग, निर्धारित समय-सीमा और जाँच योग्य समाधान रिकॉर्ड है। अंतिम पुष्टि आपके हाथ में है।",
      "प्रत्येक तक्रारीला जबाबदार विभाग, निश्चित वेळमर्यादा आणि तपासता येणारी निराकरण नोंद आहे. अंतिम खात्री तुमच्या हातात आहे.",
    ],
  "Executive Governance & Ward Oversight — Ward A & B": [
    "कार्यकारी प्रशासन और वार्ड निगरानी — वार्ड A और B",
    "कार्यकारी प्रशासन आणि प्रभाग देखरेख — प्रभाग A आणि B",
  ],
  "Explain why repair is incomplete...": [
    "काम अधूरा क्यों है, बताएँ...",
    "काम अपूर्ण का आहे ते सांगा...",
  ],
  "Export Audit Digest": [
    "कार्रवाई सारांश निर्यात करें",
    "कारवाईचा सारांश निर्यात करा",
  ],
  "Field Resolution Ready For Review": [
    "क्षेत्र समाधान समीक्षा के लिए तैयार",
    "क्षेत्र निराकरण पाहणीसाठी तयार",
  ],
  "Field Service & Ground Execution": [
    "क्षेत्र सेवा और कार्य",
    "क्षेत्र सेवा आणि काम",
  ],
  "Field team marked this work complete and supplied resolution evidence.": [
    "क्षेत्र दल ने कार्य पूरा बताया है और समाधान का सबूत दिया है।",
    "क्षेत्र पथकाने काम पूर्ण झाल्याचे नोंदवून पुरावा दिला आहे.",
  ],
  "Full Record": ["पूरा रिकॉर्ड", "पूर्ण नोंद"],
  "GovFix Citizen SLA Guarantee & Oversight Charter": [
    "गोवफिक्स नागरिक समय-सीमा और निगरानी नीति",
    "गोवफिक्स नागरिक वेळमर्यादा आणि देखरेख धोरण",
  ],
  "Grievance Categories": ["शिकायत के प्रकार", "तक्रारींचे प्रकार"],
  "Ground Execution Protocol Strict": [
    "क्षेत्र कार्य के कड़े नियम",
    "क्षेत्र कामाचे कडक नियम",
  ],
  "Ground Site:": ["कार्य स्थल:", "कामाचे ठिकाण:"],
  "I consent to microphone processing by my browser's speech service. I will review the dictated note before submitting.":
    [
      "मैं ब्राउज़र की आवाज़ सेवा से माइक्रोफ़ोन प्रसंस्करण के लिए सहमत हूँ। जमा करने से पहले लिखे विवरण की जाँच करूँगा/करूँगी।",
      "ब्राउझरच्या आवाज सेवेकडून मायक्रोफोन प्रक्रिया करण्यास माझी संमती आहे. सादर करण्यापूर्वी लिहिलेला मजकूर तपासेन.",
    ],
  "I consent to sending microphone audio to ElevenLabs for voice processing and storing the complaint transcript and reviewed draft in GovFix. Do not share passwords or identity documents.":
    [
      "मैं आवाज़ प्रसंस्करण के लिए ElevenLabs को माइक्रोफ़ोन ऑडियो भेजने और शिकायत का पाठ व जाँचा हुआ मसौदा गोवफिक्स में रखने पर सहमत हूँ। पासवर्ड या पहचान दस्तावेज़ साझा न करें।",
      "आवाज प्रक्रियेसाठी ElevenLabs कडे मायक्रोफोन ऑडिओ पाठवण्यास आणि तक्रारीचा मजकूर व तपासलेला मसुदा गोवफिक्समध्ये ठेवण्यास माझी संमती आहे. संकेतशब्द किंवा ओळखपत्रे सांगू नका.",
    ],
  "I reviewed the read-back and these exact details are correct.": [
    "मैंने दोहराई गई जानकारी जाँची है और ये विवरण सही हैं।",
    "मी पुन्हा सांगितलेला तपशील तपासला आहे आणि तो अचूक आहे.",
  ],
  "Immediate Arbitration": ["तत्काल समीक्षा", "तातडीचे पुनरावलोकन"],
  "Immutable log of statutory threshold notices, deadline alerts, and citizen escalations.":
    [
      "समय-सीमा सूचनाओं और नागरिक आपत्तियों का स्थायी रिकॉर्ड।",
      "वेळमर्यादा सूचना आणि नागरिक आक्षेपांची कायम नोंद.",
    ],
  "In Active Execution": ["कार्य जारी है", "काम सुरू आहे"],
  "Infrastructure status is shared across the deployment; case audit queues remain scoped to your grants.":
    [
      "प्रणाली की स्थिति सभी को दिखती है; शिकायत रिकॉर्ड केवल आपके अधिकार के अनुसार दिखते हैं।",
      "प्रणालीची स्थिती सर्वांना दिसते; तक्रारीच्या नोंदी फक्त तुमच्या अधिकारानुसार दिसतात.",
    ],
  Inspect: ["देखें", "पाहा"],
  "Keep reviewing": ["समीक्षा जारी रखें", "पाहणी सुरू ठेवा"],
  "Level 1 Escalation Alert": ["स्तर 1 चेतावनी", "पातळी 1 इशारा"],
  "Live civic dispatch tracker under GovFix Service Level Agreement": [
    "गोवफिक्स समय-सीमा के अंतर्गत कार्य की सीधी जानकारी",
    "गोवफिक्स वेळमर्यादेनुसार कामाची थेट माहिती",
  ],
  "Loading SLA history…": [
    "समय-सीमा रिकॉर्ड लोड हो रहा है…",
    "वेळमर्यादेची नोंद लोड होत आहे…",
  ],
  "Loading available officers…": [
    "उपलब्ध अधिकारी लोड हो रहे हैं…",
    "उपलब्ध अधिकारी लोड होत आहेत…",
  ],
  "Location Recorded": ["स्थान दर्ज", "ठिकाण नोंदले"],
  "MEETS SLA": ["समय के भीतर", "वेळेत"],
  "Municipal Public SLAs": [
    "नगरपालिका सार्वजनिक समय-सीमाएँ",
    "नगरपालिका सार्वजनिक वेळमर्यादा",
  ],
  "New deadline:": ["नई समय-सीमा:", "नवी वेळमर्यादा:"],
  "Next deliveries": ["अगली सूचनाएँ", "पुढील सूचना"],
  "Next notifications": ["अगली सूचनाएँ", "पुढील सूचना"],
  "No notifications yet. Refresh after the worker processes new events.": [
    "अभी कोई सूचना नहीं। नई घटनाएँ संसाधित होने के बाद फिर देखें।",
    "अजून सूचना नाहीत. नव्या घटना प्रक्रिया झाल्यावर पुन्हा पाहा.",
  ],
  "No provisioned officer for this ward/department yet. An administrator provisions officers via CLI.":
    [
      "इस वार्ड या विभाग के लिए अभी कोई अधिकारी उपलब्ध नहीं है। व्यवस्थापक को अधिकारी जोड़ना होगा।",
      "या प्रभाग किंवा विभागासाठी अजून अधिकारी नाही. प्रशासकाने अधिकारी जोडावा.",
    ],
  "No submitted cases awaiting validation under current filter.": [
    "वर्तमान चयन में जाँच की प्रतीक्षा वाली शिकायतें नहीं हैं।",
    "सध्याच्या निवडीत तपासणीच्या प्रतीक्षेत तक्रारी नाहीत.",
  ],
  "Officer Assignment Dock": ["अधिकारी आवंटन केंद्र", "अधिकारी वाटप केंद्र"],
  "Officer Assignment Log": ["अधिकारी आवंटन रिकॉर्ड", "अधिकारी वाटप नोंद"],
  "Officer:": ["अधिकारी:", "अधिकारी:"],
  "On submission, your browser will ask to share your current position with the authority handling this report. The written location is still required.":
    [
      "जमा करते समय ब्राउज़र आपका वर्तमान स्थान साझा करने की अनुमति माँगेगा। लिखित स्थान देना भी आवश्यक है।",
      "सादर करताना ब्राउझर सध्याचे ठिकाण शेअर करण्याची परवानगी मागेल. लिखित ठिकाण देणेही आवश्यक आहे.",
    ],
  "Open location in OpenStreetMap": [
    "स्थान OpenStreetMap में खोलें",
    "ठिकाण OpenStreetMap मध्ये उघडा",
  ],
  "Original deadline:": ["मूल समय-सीमा:", "मूळ वेळमर्यादा:"],
  "Overdue SLA Breaches": ["समय-सीमा उल्लंघन", "वेळमर्यादा उल्लंघने"],
  "Pending Acceptance": ["स्वीकृति की प्रतीक्षा", "स्वीकृतीच्या प्रतीक्षेत"],
  "Pending Verification": ["पुष्टि की प्रतीक्षा", "पडताळणीच्या प्रतीक्षेत"],
  "Permissions are checked by the server on every action.": [
    "हर कार्रवाई पर सर्वर अनुमति जाँचता है।",
    "प्रत्येक कारवाईसाठी सर्व्हर परवानगी तपासतो.",
  ],
  "Please inspect the work performed at this site. You have the right to either accept the resolution and close the case or dispute it to dispatch a supervised rework.":
    [
      "कृपया यहाँ हुआ काम जाँचें। आप समाधान स्वीकार कर शिकायत बंद कर सकते हैं या आपत्ति दर्ज कर दोबारा कार्य माँग सकते हैं।",
      "कृपया येथे झालेले काम तपासा. निराकरण स्वीकारून तक्रार बंद करू शकता किंवा आक्षेप घेऊन पुनर्काम मागू शकता.",
    ],
  Policy: ["नीति", "धोरण"],
  "Previous deliveries": ["पिछली सूचनाएँ", "मागील सूचना"],
  "Previous notifications": ["पिछली सूचनाएँ", "मागील सूचना"],
  "Prioritized queue": ["प्राथमिकता कतार", "प्राधान्य रांग"],
  Priority: ["प्राथमिकता", "प्राधान्य"],
  "Private Supabase Storage": ["निजी सुपाबेस संग्रह", "खाजगी सुपाबेस साठवण"],
  "Queue Stage: Validated / Ready": [
    "कतार स्थिति: जाँची गई / तैयार",
    "रांगेची स्थिती: तपासलेली / तयार",
  ],
  "Read aloud uses your browser's speech service. Case details remain available as text.":
    [
      "ज़ोर से पढ़ने के लिए ब्राउज़र की आवाज़ सेवा उपयोग होती है। शिकायत का विवरण लिखित रूप में भी उपलब्ध है।",
      "मोठ्याने वाचण्यासाठी ब्राउझरची आवाज सेवा वापरली जाते. तक्रारीचा तपशील लेखीही उपलब्ध आहे.",
    ],
  "Read case timeline aloud": [
    "शिकायत का इतिहास सुनें",
    "तक्रारीचा इतिहास ऐका",
  ],
  "Read resolution aloud": ["समाधान सुनें", "निराकरण ऐका"],
  "Read-only intake policy. Existing cases retain the policy version recorded in their case details.":
    [
      "प्राप्ति नीति केवल पढ़ने के लिए है। मौजूदा शिकायतें अपना दर्ज नीति संस्करण रखती हैं।",
      "स्वीकृती धोरण फक्त वाचनासाठी आहे. विद्यमान तक्रारींमध्ये नोंदलेली धोरण आवृत्ती कायम राहते.",
    ],
  "Refresh notifications": ["सूचनाएँ फिर लाएँ", "सूचना पुन्हा आणा"],
  "Rejection Reason Codes": ["अस्वीकृति कारण", "नकाराची कारणे"],
  "Reported device position:": ["दर्ज उपकरण स्थान:", "नोंदवलेले उपकरण ठिकाण:"],
  "Reported location on OpenStreetMap": [
    "दर्ज स्थान OpenStreetMap पर",
    "नोंदवलेले ठिकाण OpenStreetMap वर",
  ],
  "Resolved & Closed": ["समाधान हुआ और बंद", "निराकरण झाले आणि बंद"],
  "Retry delivery": ["सूचना फिर भेजें", "सूचना पुन्हा पाठवा"],
  "Retry reason": ["दोबारा प्रयास का कारण", "पुन्हा प्रयत्नाचे कारण"],
  "Roster Sync: Active": ["अधिकारी सूची सक्रिय", "अधिकारी यादी सक्रिय"],
  "SLA Compliance Rate": ["समय-सीमा पालन दर", "वेळमर्यादा पालन दर"],
  "SLA Status": ["समय-सीमा स्थिति", "वेळमर्यादा स्थिती"],
  "SLA Target:": ["समय लक्ष्य:", "वेळ लक्ष्य:"],
  "SLA Threshold Alert:": ["समय-सीमा चेतावनी:", "वेळमर्यादा इशारा:"],
  "SLA Unassigned Breaches": [
    "बिना आवंटन के समय उल्लंघन",
    "वाटप नसलेली वेळ उल्लंघने",
  ],
  "SLA and escalation": ["समय-सीमा और वृद्धि", "वेळमर्यादा आणि वाढ"],
  "Scope Rules:": ["अधिकार क्षेत्र नियम:", "अधिकार क्षेत्राचे नियम:"],
  "Select Attached Resolution Proof Photo": [
    "संलग्न समाधान फोटो चुनें",
    "जोडलेला निराकरण फोटो निवडा",
  ],
  "Select a validated case to assign": [
    "आवंटन के लिए जाँची गई शिकायत चुनें",
    "वाटपासाठी तपासलेली तक्रार निवडा",
  ],
  "Select on-duty officer": ["कार्यरत अधिकारी चुनें", "कार्यरत अधिकारी निवडा"],
  "Submit this grievance?": ["यह शिकायत जमा करें?", "ही तक्रार सादर करायची?"],
  "Submitted:": ["दर्ज किया:", "नोंदवले:"],
  "Supervisor Review Reason": [
    "पर्यवेक्षक समीक्षा का कारण",
    "पर्यवेक्षक पुनरावलोकनाचे कारण",
  ],
  "Supervisor Scope": ["पर्यवेक्षक क्षेत्र", "पर्यवेक्षक क्षेत्र"],
  "Supervisor review after the response window if unanswered": [
    "उत्तर न मिलने पर निर्धारित समय के बाद पर्यवेक्षक समीक्षा",
    "उत्तर न आल्यास ठरलेल्या वेळेनंतर पर्यवेक्षक पुनरावलोकन",
  ],
  "Sync Queue": ["कतार फिर लाएँ", "रांग पुन्हा आणा"],
  "Target Deadline": ["लक्षित समय-सीमा", "लक्ष्य वेळमर्यादा"],
  "The reviewed details will be recorded as your complaint and sent into the municipal workflow.":
    [
      "जाँचे गए विवरण आपकी शिकायत के रूप में दर्ज होकर नगरपालिका प्रक्रिया में जाएँगे।",
      "तपासलेले तपशील तुमची तक्रार म्हणून नोंदवून नगरपालिका प्रक्रियेत पाठवले जातील.",
    ],
  "There are no cases assigned to field execution under the current filter.": [
    "वर्तमान चयन में कोई शिकायत क्षेत्र कार्य के लिए नहीं सौंपी गई है।",
    "सध्याच्या निवडीत क्षेत्र कामासाठी कोणतीही तक्रार दिलेली नाही.",
  ],
  "Upload a photo in the Evidence section below before submitting resolution.":
    [
      "समाधान प्रस्तुत करने से पहले नीचे सबूत में फोटो अपलोड करें।",
      "निराकरण सादर करण्यापूर्वी खाली पुरावा विभागात फोटो अपलोड करा.",
    ],
  "Validated / Ready": ["जाँची गई / तैयार", "तपासलेली / तयार"],
  "Validated Grievance Summary": [
    "जाँची गई शिकायत का सार",
    "तपासलेल्या तक्रारीचा सारांश",
  ],
  "Validation Inspector": ["जाँच अधिकारी", "तपासणी अधिकारी"],
  "Verification Waits": ["पुष्टि की प्रतीक्षा", "पडताळणीची प्रतीक्षा"],
  "View Details": ["विवरण देखें", "तपशील पाहा"],
  "Visible Queue": ["दिखने वाली कतार", "दिसणारी रांग"],
  Ward: ["वार्ड", "प्रभाग"],
  "Ward & Category": ["वार्ड और प्रकार", "प्रभाग आणि प्रकार"],
  "Ward & Sector": ["वार्ड और क्षेत्र", "प्रभाग आणि क्षेत्र"],
  "Ward A & B Total": ["वार्ड A और B कुल", "प्रभाग A आणि B एकूण"],
  "Ward Operations Active": ["वार्ड कार्य सक्रिय", "प्रभाग काम सक्रिय"],
  "What Still Needs To Be Fixed?": [
    "अब भी क्या ठीक होना बाकी है?",
    "अजून काय दुरुस्त करायचे आहे?",
  ],
  "Your feedback audits municipal performance": [
    "आपकी राय नगरपालिका कार्य की समीक्षा करती है",
    "तुमचा अभिप्राय नगरपालिका कामाचे परीक्षण करतो",
  ],
  "grievances visible": ["शिकायतें दिखाई दे रही हैं", "तक्रारी दिसत आहेत"],
  "with immutable cryptographic audit trail.": [
    "सुरक्षित कार्रवाई रिकॉर्ड के साथ।",
    "सुरक्षित कारवाई नोंदीसह.",
  ],
  "• Due": ["• अंतिम समय", "• अंतिम वेळ"],
  "• Owner:": ["• जिम्मेदार:", "• जबाबदार:"],
  "• Ward": ["• वार्ड", "• प्रभाग"],
};

const translatedText = new WeakMap<Text, { source: string; shown: string }>();
const translatedAttributes = new WeakMap<
  Element,
  Map<string, { source: string; shown: string }>
>();

function translate(value: string, language: PageLanguage): string {
  const match = /^(\s*)(.*?)(\s*)$/s.exec(value);
  if (!match || language === "en") return value;
  const entry = copy[match[2]];
  return entry
    ? `${match[1]}${entry[language === "hi" ? 0 : 1]}${match[3]}`
    : value;
}

function translateElement(root: Node, language: PageLanguage) {
  if (
    root instanceof Element &&
    root.closest("[data-no-translate], .material-symbols-outlined")
  )
    return;
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  let node: Node | null = root;
  while (node) {
    if (
      node instanceof Text &&
      node.parentElement &&
      !node.parentElement.closest(
        "[data-no-translate], .material-symbols-outlined, script, style, textarea",
      )
    ) {
      const previous = translatedText.get(node);
      const source =
        previous && node.data === previous.shown ? previous.source : node.data;
      const shown = translate(source, language);
      translatedText.set(node, { source, shown });
      if (node.data !== shown) node.data = shown;
    } else if (
      node instanceof Element &&
      !node.closest("[data-no-translate], .material-symbols-outlined")
    ) {
      const values = translatedAttributes.get(node) ?? new Map();
      for (const name of ["aria-label", "title", "placeholder"]) {
        const current = node.getAttribute(name);
        if (current === null) continue;
        const previous = values.get(name);
        const source =
          previous && current === previous.shown ? previous.source : current;
        const shown = translate(source, language);
        values.set(name, { source, shown });
        if (current !== shown) node.setAttribute(name, shown);
      }
      translatedAttributes.set(node, values);
    }
    node = walker.nextNode();
  }
}

export function AccessibilityControls() {
  const [language, setLanguage] = useState<PageLanguage>(() => {
    const saved = localStorage.getItem(languageKey);
    return saved === "hi" || saved === "mr" ? saved : "en";
  });
  const [contrast, setContrast] = useState(
    () => localStorage.getItem(contrastKey) === "true",
  );

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = {
      en: "GovFix · Municipal Grievance & SLA Operations",
      hi: "गोवफिक्स · नगरपालिका शिकायत और समय-सीमा संचालन",
      mr: "गोवफिक्स · नगरपालिका तक्रार आणि वेळमर्यादा कामकाज",
    }[language];
    localStorage.setItem(languageKey, language);
    const root = document.body;
    let queued = false;
    const refresh = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        translateElement(root, language);
      });
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(root, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-label", "title", "placeholder"],
      subtree: true,
    });
    return () => observer.disconnect();
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset.contrast = contrast ? "high" : "normal";
    localStorage.setItem(contrastKey, String(contrast));
  }, [contrast]);

  const labels = {
    en: ["Page language", "High contrast", "Standard contrast"],
    hi: ["पृष्ठ की भाषा", "उच्च कंट्रास्ट", "सामान्य कंट्रास्ट"],
    mr: ["पानाची भाषा", "उच्च विरोधाभास", "सामान्य विरोधाभास"],
  }[language];

  return (
    <div
      data-no-translate
      className="flex flex-wrap items-center justify-end gap-2 text-xs"
    >
      <label className="sr-only" htmlFor="page-language">
        {labels[0]}
      </label>
      <select
        id="page-language"
        aria-label={labels[0]}
        value={language}
        onChange={(event) => setLanguage(event.target.value as PageLanguage)}
        className="rounded-md border border-[#747686] bg-white px-2 py-1.5 text-[#0b1c30] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0037b0]"
      >
        <option value="en">English</option>
        <option value="hi">हिन्दी</option>
        <option value="mr">मराठी</option>
      </select>
      <button
        type="button"
        aria-pressed={contrast}
        onClick={() => setContrast((current) => !current)}
        className="rounded-md border border-[#747686] bg-white px-2 py-1.5 font-semibold text-[#0b1c30] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0037b0]"
      >
        {contrast ? labels[2] : labels[1]}
      </button>
    </div>
  );
}
