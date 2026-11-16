import "@tanstack/react-start/server-only";
import { type ServerContext, sharedServerContext } from "./backends";

export type { ServerContext };

export function getServerContext(): ServerContext {
	return sharedServerContext();
}
