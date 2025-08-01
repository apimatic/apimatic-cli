import { log } from "@clack/prompts";

export class LoginPrompts {
  logError(error: string) {
    log.error(error);
  }

  loginSuccessful(email: string) {
    log.success(`Successfully logged in as ${email}`);
  }

  openBrowser() {
    log.info("Please continue with authentication in the opened browser window.");
  }
}
