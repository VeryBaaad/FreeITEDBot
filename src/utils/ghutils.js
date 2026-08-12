export async function runWorkflow(repo, workflow_id, ref, inputs = {}) {
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflow_id}/dispatches`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github.v3+json",
      "Authorization": `Bearer ${github_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ref: ref,
      inputs: inputs
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to run workflow: ${response.status} ${response.statusText}`);
  }
};
