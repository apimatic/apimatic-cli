import { log, spinner } from "@clack/prompts";

export abstract class BasePrompts {
    protected readonly spin = spinner();

    public startProgressIndicator(message: string): void {
        this.spin.start(message);
    }

    public stopProgressIndicator(message: string): void {
        this.spin.stop(message);
    }

    public displayInfo(message: string): void {
        log.step(message);
    }

    public displaySuccess(message: string) : void {
        log.success(message);
    }

    public logError(errorMessage: string): void {
        log.error(errorMessage);
    }
}