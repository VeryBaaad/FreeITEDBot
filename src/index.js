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
import * as itedutils from './utils/lspited.js';
import * as ghutils from './utils/ghutils.js';
import { verify } from './utils/gh_sign.js';
import { isGitHubAccountFullOneDay, isGitHubAccountInList } from './utils/gh_account.js';
import { antiRobot } from './utils/anti_robot.js';
const replies = require('./replies.js');

export default {
    async fetch(request, env, ctx) {
	    global.bot_token = env.BOT_TOKEN;
		global.github_token = env.GH_TOKEN;
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
				if (await itedutils.isTgBanned(env.ITED_USERS, payload.chat_join_request.from.id)) {
					await tgutils.declineChatJoinRequest(env.JOIN_CHAT_MANAGE, payload.chat_join_request.from.id);
					await tgutils.sendMessage(payload.chat_join_request.from.id, replies['message']['banned']);
					return new Response(null, { status: 200 });
				}
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
		} else if (url.pathname === "/validate") {
			const initData = request.headers.get("X-Auth");
			if (!initData)
				return new Response(null, { status: 401 });
			const params = new URLSearchParams(initData);
		    if (!params.has("auth_date") || !params.has("hash"))
				return new Response(null, { status: 401 });
		    if (!await tgutils.verifyInitData(params, params.get("hash"))) {
		        return new Response(null, { status: 403 });
			};
			const userInfo = JSON.parse(params.get("user"));
			if (await itedutils.isTgBanned(env.ITED_USERS, userInfo.id)) {
				return new Response(JSON.stringify({
					ok: false,
					message: replies['message']['banned']
				}), {
					status: 200,
					headers: {
						"Content-Type": "application/json"
					}
				});
			}
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
		    if (!params.has("auth_date") || !params.has("hash"))
				return new Response(null, { status: 401 });
			if (!await tgutils.verifyInitData(params, params.get("hash"))) {
		        return new Response(null, { status: 403 });
			};
			const userInfo = JSON.parse(params.get("user"));
			if (await itedutils.isTgBanned(env.ITED_USERS, userInfo.id)) {
				return new Response(JSON.stringify({
					ok: false,
					message: replies['message']['banned']
				}), {
					status: 200,
					headers: {
						"Content-Type": "application/json"
					}
				});
			}
			let payload;
		    try {
			    payload = await request.json();
		    } catch {
			    return new Response(null, { status: 400 });
		    }
			const { success } = await (
				await fetch("https://cap.baaad.xyz/" + env.CAP_SITE_KEY + "/siteverify", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ secret: env.CAP_SITE_SECRET, response: payload.token }),
				})
			).json();
			if (!success) {
				return new Response(JSON.stringify({
					ok: false,
					message: "Please complete Cap verification\n请完成 Cap 验证"
				}), {
					status: 200,
					headers: {
						"Content-Type": "application/json"
					}
				});
			}
			if (await tgutils.isJoined(env.JOIN_CHAT_MANAGE, userInfo.id) && !payload.username && !payload.signature) {
				if (await itedutils.isWithinTimeLimit(env.ITED_USERS, userInfo.id)) {
					await tgutils.sendMessage(userInfo.id, replies['message']['uploading']);
					if (await itedutils.isDebugMode(env.ITED_USERS, userInfo.id)) {
						await ghutils.runWorkflow(env.GH_REPO, "debug.yml", env.GH_BRANCH, {
							github_id: String(await itedutils.findTelegramToGitHub(env.ITED_USERS, userInfo.id)),
							tg_id: String(userInfo.id),
						});
					} else {
						await ghutils.runWorkflow(env.GH_REPO, "release.yml", env.GH_BRANCH, {
							github_id: String(await itedutils.findTelegramToGitHub(env.ITED_USERS, userInfo.id)),
							tg_id: String(userInfo.id),
						});
					}
					return new Response(JSON.stringify({
						ok: true,
						message: replies['message']['uploading']
					}), {
						status: 200,
						headers: {
							"Content-Type": "application/json"
						}
					});
				} else {
					return new Response(JSON.stringify({
						ok: false,
						message: replies['message']['waittime']
					}), {
						status: 200,
						headers: {
							"Content-Type": "application/json"
						}
					});
				}
			} else {
				if (await verify(payload.username, payload.signature, Buffer.from(String(userInfo.id)).toString("base64"))) {
					const ghResult = await isGitHubAccountFullOneDay(payload.username, { env })
					if (!ghResult.ok) {
						await tgutils.declineChatJoinRequest(env.JOIN_CHAT_MANAGE, userInfo.id);
						await tgutils.sendMessage(userInfo.id, replies['message']['github_not_eligible']);
						return new Response(JSON.stringify({
							ok: false,
							message: replies['message']['github_not_eligible']
						}), {
							status: 200,
							headers: {
								"Content-Type": "application/json"
							}
						});
					}
					if (await itedutils.isGhBanned(env.ITED_GH_USERS, ghResult.id)) {
						await tgutils.declineChatJoinRequest(env.JOIN_CHAT_MANAGE, userInfo.id);
						await itedutils.banTelegramAccount(env.ITED_USERS, userInfo.id, await itedutils.getGitHubBanResult(env.ITED_GH_USERS, ghResult.id), env.JOIN_CHAT_MANAGE);
						await tgutils.sendMessage(userInfo.id, replies['message']['banned']);
						return new Response(JSON.stringify({
							ok: false,
							message: replies['message']['banned']
						}), {
							status: 200,
							headers: {
								"Content-Type": "application/json"
							}
						});
					}
					if (await isGitHubAccountInList(env.ITED_GH_USERS, ghResult.id)) {
						const tgId = await itedutils.findGitHubToTelegram(env.ITED_GH_USERS, ghResult.id);
						await tgutils.declineChatJoinRequest(env.JOIN_CHAT_MANAGE, userInfo.id);
						await itedutils.banTelegramAccount(env.ITED_USERS, userInfo.id, "duplicate", env.JOIN_CHAT_MANAGE);
						await itedutils.banTelegramAccount(env.ITED_USERS, tgId, "duplicate", env.JOIN_CHAT_MANAGE);
						await itedutils.banGitHubAccount(env.ITED_GH_USERS, ghResult.id, "duplicate");
						await tgutils.sendMessage(userInfo.id, replies['message']['duplicate']);
						await tgutils.sendMessage(tgId, replies['message']['banned']);
						return new Response(JSON.stringify({
							ok: false,
							message: replies['message']['duplicate']
						}), {
							status: 200,
							headers: {
								"Content-Type": "application/json"
							}
						});
					}
					await tgutils.approveChatJoinRequest(env.JOIN_CHAT_MANAGE, userInfo.id);
					await env.ITED_USERS.put(userInfo.id, JSON.stringify({
						github: ghResult.id
					}));
					await env.ITED_GH_USERS.put(ghResult.id, JSON.stringify({
						telegram: userInfo.id
					}));
					await tgutils.sendMessage(userInfo.id, replies['message']['approved']);
					return new Response(JSON.stringify({
						ok: true,
						message: replies['message']['approved']
					}), {
						status: 200,
						headers: {
							"Content-Type": "application/json"
						}
					});
				} else {
					await tgutils.declineChatJoinRequest(env.JOIN_CHAT_MANAGE, userInfo.id);
					await tgutils.sendMessage(userInfo.id, replies['message']['signature_failed']);
					return new Response(JSON.stringify({
						ok: false,
						message: replies['message']['signature_failed']
					}), {
						status: 200,
						headers: {
							"Content-Type": "application/json"
						}
					});
				}
			}
		} else {
			try {
			    return await ASSETS.fetch(request);
			} catch {
				let decodedPath;
				try {
				    decodedPath = decodeURIComponent(url.pathname);
				} catch {
					decodedPath = url.pathname;
				}
				return await antiRobot(env.AI, decodedPath);
			}
		}
        return new Response("200 ok", { status: 200 });
    },
};
