/**
 * Cloudflare Images API — upload by URL.
 * Returns the CF Images ID (stored as photo_optimized_key).
 * Full URL: ${CF_IMAGES_BASE_URL}/${id}/public
 */
export async function uploadImageFromUrl(
  accountId: string,
  apiToken: string,
  sourceUrl: string,
): Promise<string> {
  const form = new FormData()
  form.append('url', sourceUrl)
  form.append('requireSignedURLs', 'false')

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}` },
      body: form,
    },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`CF Images upload failed: ${res.status} ${text}`)
  }

  const json = (await res.json()) as { result: { id: string } }
  return json.result.id
}
