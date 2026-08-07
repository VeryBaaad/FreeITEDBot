/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import * as tgutils from './utils/telegram.js';
const replies = require('./replies.js');

export default {
    async fetch(request, env, ctx) {
	    global.bot_token = env.BOT_TOKEN;
	    if (!bot_token) {
		  throw new Error(replies['error']['missing_bot_token']);
	    }
        const url = new URL(request.url);
	    if (url.pathname === "/webhook") {
	  	    if (request.cf.asOrganization != replies['other']['tg_org']
			    || request.headers.get(replies['other']['secret_head']) != env.WEBHOOK_SECRET
		    ) {
			    return new Response(null, { status: 403 });
		    }
		    let payload;
		    try {
			    payload = await request.json();
		    } catch {
			    return new Response(null, { status: 400 });
		    }
		    if (payload.chat_join_request && payload.chat_join_request.chat.id == env.JOIN_CHAT_MANAGE) {
				await fetch(
					`https://api.telegram.org/bot${bot_token}/sendMessage`,
					{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						chat_id: payload.chat_join_request.from.id,
						text: replies['message']['complete_verification'],
						reply_markup: {
							inline_keyboard: [
								[
									{
										text: replies['button']['verify'],
										web_app: {
											url: env.VERIFY_URL
										}
									}
								]
							]
						}
					}),
					}
				);
			}
		} else if (url.pathname === "/validate") {
			const initData = request.headers.get("X-Auth");
			if (!initData)
				return new Response(null, { status: 401 });
			const params = new URLSearchParams(initData);
		    if (!params.has("query_id") || !params.has("user") || !params.has("auth_date") || !params.has("hash"))
				return new Response(null, { status: 401 });
			if (!await tgutils.verifyInitData(params, params.get("hash"))) {
				return new Response(null, { status: 403 });
			};
			const userInfo = JSON.parse(params.get("user"));
			return new Response(JSON.stringify({
				ok: true,
				cap_site_key: env.CAP_SITE_KEY,
				challenge_code: Buffer.from(String(userInfo.id)).toString("base64")
			}), {
				status: 200,
				headers: {
					"Content-Type": "application/json"
				}
			});
		} else if (url.pathname === "/submit") {
			const initData = request.headers.get("X-Auth");
			if (!initData)
				return new Response(null, { status: 401 });
			const params = new URLSearchParams(initData);
		    if (!params.has("query_id") || !params.has("user") || !params.has("auth_date") || !params.has("hash"))
				return new Response(null, { status: 401 });
			if (!await tgutils.verifyInitData(params, params.get("hash"))) {
				return new Response(null, { status: 403 });
			};
			tgutils.declineChatJoinRequest(env.JOIN_CHAT_MANAGE, JSON.parse(params.get("user")).id);
			return new Response(JSON.stringify({
				ok: false,
				message: replies['message']['github_not_eligible']
			}), {
				status: 200,
				headers: {
					"Content-Type": "application/json"
				}
			});
		} else {
			try {
			    return await ASSETS.fetch(request);
			} catch {
				return new Response("404 page not found", { status: 404 });
			}
		}
        return new Response("200 ok", { status: 200 });
    },
};
