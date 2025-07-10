import { PortalServePrompts } from "../../prompts/portal/serve.js";
import { ServeFlags } from "../../types/portal/serve.js";

export class PortalServeAction {
    private readonly prompts: PortalServePrompts;

    public constructor() {
        this.prompts = new PortalServePrompts();
    }

    public async servePortal(
        flags: ServeFlags) {

    }
}