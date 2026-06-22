export async function analyzeTradeDataWith0GCompute({
  tradeData,
  rootHash,
}: {
  tradeData: unknown;
  rootHash?: string;
}) {
  const response = await fetch("http://localhost:3001/analyze-trade-data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tradeData,
      rootHash,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || result.error || "0G Compute request failed");
  }

  return result.analysis as string;
}