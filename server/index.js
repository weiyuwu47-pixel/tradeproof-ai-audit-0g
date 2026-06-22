import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const useMock = process.env.USE_MOCK === "true";

const client = new OpenAI({
  apiKey: process.env.OG_COMPUTE_API_KEY,
  baseURL: process.env.OG_COMPUTE_BASE_URL || "https://router-api.0g.ai/v1",
  timeout: 120000,
});

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "TradeProof AI 0G Compute Server",
    mode: useMock ? "mock" : "real_0g_compute",
  });
});

app.post("/analyze-trade-data", async (req, res) => {
  try {
    const { tradeData, rootHash } = req.body;

    if (!tradeData) {
      return res.status(400).json({
        error: "Missing tradeData in request body.",
      });
    }

    // 省钱调试模式：不调用 0G Compute
    if (useMock) {
      return res.json({
        model: "mock-local-debug",
        rootHash: rootHash || null,
        analysis: `
Mock analysis from local server.

1. Business summary
This trade record has been received by the local backend. The frontend-to-server flow works.

2. Potential risks
This is only a mock response, so no real AI inference has been used yet.

3. Missing information
Please check whether product model, quantity, customer country, and quotation status are included in your JSON.

4. Suggested follow-up questions
- What is the customer's target price?
- Is this for sample validation or mass production?
- What is the required delivery date?

5. Why 0G Storage + 0G Compute matters
0G Storage can keep the trade data as a verifiable data snapshot. 0G Compute can analyze the stored data through decentralized AI inference.
        `.trim(),
      });
    }

    const model = process.env.OG_COMPUTE_MODEL;

    if (!model) {
      return res.status(500).json({
        error: "Missing OG_COMPUTE_MODEL in server/.env",
      });
    }

    const completion = await client.chat.completions.create({
      model,
      max_tokens: 500,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a practical trade data analyst for a traditional manufacturing export business. Keep the answer concise.",
        },
        {
          role: "user",
          content: `
I uploaded a trade/export data record to 0G Storage.

Storage root hash:
${rootHash || "Not provided"}

Trade data:
${JSON.stringify(tradeData, null, 2)}

Please return a concise analysis with:

1. Business summary
2. Potential risks
3. Missing information
4. Suggested follow-up questions
5. Why this workflow benefits from 0G Storage + 0G Compute

Keep the answer under 400 words.
          `,
        },
      ],
    });

    const analysis =
      completion.choices?.[0]?.message?.content || "No analysis returned.";

    res.json({
      analysis,
      model,
      rootHash: rootHash || null,
    });
  } catch (error) {
    console.error("0G Compute error:", error);

    res.status(500).json({
      error: "Failed to analyze trade data with 0G Compute.",
      detail: error?.message || String(error),
    });
  }
});

const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`TradeProof AI server running on http://localhost:${port}`);
  console.log(`Mode: ${useMock ? "MOCK, no 0G cost" : "REAL 0G Compute"}`);
});
