import * as tgutils from './../utils/telegram.js';
import * as itedutils from './../utils/lspited.js';

const replies = require('./../replies.js');

export async function handleWebhook(request, env) {
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
		if (await itedutils.isTgBanned(env.ITED_USERS, payload.chat_join_request.from.id)) {
			await tgutils.declineChatJoinRequest(env.JOIN_CHAT_MANAGE, payload.chat_join_request.from.id);
			await tgutils.sendMessage(payload.chat_join_request.from.id, replies['message']['banned']);
			return new Response(null, { status: 200 });
		}
        await itedutils.setChallengeCode(env.ITED_USERS, payload.chat_join_request.from.id);
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
		return new Response(null, { status: 200 });
	} else if (payload.message) {
		if (await itedutils.isTgBanned(env.ITED_USERS, payload.message.from.id)) {
			await tgutils.sendMessage(payload.message.chat.id, replies['message']['banned']);
			return new Response(null, { status: 200 });
		}
		if (payload.message.chat.type === "private") {
			if (payload.message.text && (payload.message.text.startsWith("/start dl")
			    || payload.message.text.startsWith("/dl"))) {
				if (await itedutils.isWithinTimeLimit(env.ITED_USERS, payload.message.from.id)) {
					await tgutils.sendMessage(payload.message.chat.id, replies['message']['waittime']);
					return new Response(null, { status: 200 });
				}
				if (payload.message.text && payload.message.text.startsWith("/dl_debug")) {
					await itedutils.setDebugMode(env.ITED_USERS, payload.message.from.id, true);
				} else {
					await itedutils.setDebugMode(env.ITED_USERS, payload.message.from.id, false);
				}
				const nowTimestamp = Math.floor(Date.now() / 1000);
				await itedutils.setTimestamp(env.ITED_USERS, payload.message.from.id, nowTimestamp);
				await fetch(
					`https://api.telegram.org/bot${bot_token}/sendMessage`,
					{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						chat_id: payload.message.from.id,
						text: replies['message']['complete_verification'],
						reply_markup: {
							inline_keyboard: [
								[
									{
										text: replies['button']['verify'],
										web_app: {
											url: env.VERIFY_URL + "dl/?ts=" + nowTimestamp
										}
									}
								]
							]
						}
					}),
					}
				);
			}
		}
		if (await itedutils.isUserAdmin(env.TG_ADMIN_USERS, payload.message.from?.id)) {
			if (payload.message.text && payload.message.text.startsWith("!ban ")) {
				const parts = payload.message.text.split(" ");
				if (parts.length >= 2 && parts[1]) {
					const userId = parts[1];
					const reason = await itedutils.escapeMarkdownV2(parts.slice(2).join(" ")) || "leak";
					await itedutils.banTelegramAccount(env.ITED_USERS, userId, reason, env.JOIN_CHAT_MANAGE);
					await tgutils.sendMessage(payload.message.chat.id, `User ${userId} banned for reason:\n\`${reason}\``, true);
				}
			} else if (payload.message.text && payload.message.text.startsWith("!ban_github ")) {
				const parts = payload.message.text.split(" ");
				if (parts.length >= 2 && parts[1]) {
					const ghId = parts[1];
					const reason = await itedutils.escapeMarkdownV2(parts.slice(2).join(" ")) || "leak";
					await itedutils.banGitHubAccount(env.ITED_GH_USERS, ghId, reason);
					await tgutils.sendMessage(payload.message.chat.id, `Github user ${ghId} banned for reason:\n\`${reason}\``, true);
				}
			}
		}
		return new Response(null, { status: 200 });
	}
}