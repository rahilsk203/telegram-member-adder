# Telegram Daily Member Adder

A complete, exact, production-ready system to automatically add exactly ~20 high-quality users to one target Telegram channel/group daily using a local StringSession and an OpenAI-compatible LLM.

## Setup

1. **Install dependencies**:
   ```sh
   npm install
   ```

2. **Configure environment**:
   Copy `.env.example` to `.env` and fill in your details:
   - `API_ID` and `API_HASH`: Get from my.telegram.org.
   - `TARGET_CHANNEL`: e.g. `@my_group` or `-100...`
   - `NICHE`: Target audience (e.g. `crypto trading`)
   - `LLM_BASE_URL` and `LLM_API_KEY`: Setup your preferred provider (OpenAI, OpenRouter, Together AI).

3. **First Run (Interactive Login)**:
   You need to do a manual login to obtain a valid GramJS `StringSession` token which will be saved in `sessions/session.txt`.
   ```sh
   npm run setup
   ```
   Follow the prompts using your Telegram phone number, password, and OTP.

## Running the Application

### Deploy 24/7 with PM2
To run this application continuously so the daily job triggers at `10:00 UTC`:
```sh
npm install -g pm2
pm2 start src/index.js --name "telegram-adder"
```

### Manual Trigger
To run exactly once immediately:
```sh
node src/index.js --run-now
```

## LLM Engine
This project utilizes a custom **Grok Reverse Engine** located in the `core/` folder. It translates high-level prompts into Grok-compatible requests using a reverse-engineered web flow. 

Supported models (set in `.env`):
* `grok-3-auto`
* `grok-3-fast`
* `grok-4`
* `grok-4-mini-thinking-tahoe`

## Warning
Adding large volumes of members automatically violates Telegram's anti-spam rules. The script enforces a strict 20 members/day limit with large delay jitters to minimize ban risk, but **use it at your own risk**. Target only groups, understand limitations, and use alternative aged phone numbers when possible.
# telegram-member-adder
