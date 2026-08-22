import * as tgutils from './../utils/telegram.js';
import * as itedutils from './../utils/lspited.js';
import * as ghutils from './../utils/ghutils.js';
import { verify } from './../utils/gh_sign.js';
import { isGitHubAccountFullOneDay, isGitHubAccountInList } from './../utils/gh_account.js';

const replies = require('./../replies.js');

export async function onValidate(request, env) {
    const initData = request.headers.get("X-Auth");
	if (!initData) return await failedValidate();
	const params = new URLSearchParams(initData);
    if (!params.has("auth_date") || !params.has("hash"))
		return await failedValidate();
    if (!await tgutils.verifyInitData(params, params.get("hash"))) {
		return await failedValidate();
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
}

export async function onSubmit(request, env) {
    const initData = request.headers.get("X-Auth");
	if (!initData)
		return await failedParse();
	const params = new URLSearchParams(initData);
    if (!params.has("auth_date") || !params.has("hash"))
		return await failedParse();
	if (!await tgutils.verifyInitData(params, params.get("hash"))) {
        return await failedParse();
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
	    return await failedParse();
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
		if (await verify(payload.username, payload.signature, await itedutils.getChallengeCode(userInfo.id))) {
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
}

async function failedParse() {
	return new Response(JSON.stringify({
		ok: false,
		message: replies['message']['failed_parse_body']
	}), {
		status: 200,
		headers: {
			"Content-Type": "application/json"
		}
	});
}

async function failedValidate() {
    return new Response(JSON.stringify({
		ok: false,
		message: replies['message']['validate_failed']
	}), {
		status: 200,
		headers: {
			"Content-Type": "application/json"
		}
	});
}