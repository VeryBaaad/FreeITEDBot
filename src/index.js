import { handleWebhook } from './dists/webhook.js';
import { onValidate, onSubmit } from './dists/webuihook.js';
const replies = require('./replies.js');

export default {
    async fetch(request, env, ctx) {
	    global.bot_token = env.BOT_TOKEN;
		global.github_token = env.GH_TOKEN;
	    if (!bot_token || !github_token) throw new Error(replies['error']['missing_bot_token']);
        const url = new URL(request.url);
	    if (url.pathname === "/webhook") {
			return await handleWebhook(request, env);
		} else if (url.pathname === "/validate") {
			return await onValidate(request, env);
		} else if (url.pathname === "/submit") {
			return await onSubmit(request, env);
		} else {
			const res = await ASSETS.fetch(request);
			return res.status === 404 ? new Response("404 page not found", { status: 404 }) : res;
		}
    },
};
