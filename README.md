<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1a767e4d-a42f-4a41-a9cb-1c052bcc46f6

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

---

## AML/KYC Compliance Management (Google Apps Script)

A separate, self-contained Google Apps Script web application (Google Sheets database + Google Drive repository) for QFC AML/KYC record-keeping lives in [`aml-kyc-app/`](aml-kyc-app/README.md). It is independent of the app above.
