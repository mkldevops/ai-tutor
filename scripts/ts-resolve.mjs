import { registerHooks } from "node:module";

registerHooks({
	resolve(specifier, context, nextResolve) {
		try {
			return nextResolve(specifier, context);
		} catch (error) {
			if (
				error?.code !== "ERR_MODULE_NOT_FOUND" ||
				!/^(#\/|\.{1,2}\/)/.test(specifier) ||
				/\.[cm]?[jt]sx?$/.test(specifier)
			) {
				throw error;
			}
			return nextResolve(`${specifier}.ts`, context);
		}
	},
});
