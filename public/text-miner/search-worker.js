const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "had", "has", "have", "he", "her",
  "his", "i", "in", "is", "it", "its", "me", "my", "not", "of", "on", "or", "our", "she", "so", "that", "the",
  "their", "them", "there", "they", "this", "to", "was", "we", "were", "with", "you", "your",
]);

const index = {
  works: [],
  passages: [],
  postings: new Map(),
  avgLength: 0,
  ready: false,
};

self.addEventListener("message", async (event) => {
  const { type, payload } = event.data || {};
  try {
    if (type === "build") {
      await buildIndex(payload.works || []);
    }
    if (type === "search") {
      search(payload);
    }
  } catch (error) {
    postMessage({ type: "error", payload: { message: error.message || "Search worker failed." } });
  }
});

async function buildIndex(works) {
  index.works = works;
  let totalLength = 0;

  for (let i = 0; i < works.length; i += 1) {
    const work = works[i];
    postMessage({ type: "progress", payload: { message: `Indexing ${i + 1} of ${works.length}: ${work.title}` } });
    const response = await fetch(work.path);
    if (!response.ok) continue;
    const text = await response.text();
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      const tokens = tokenize(chunk.text);
      if (tokens.length < 24) continue;
      const passageIndex = index.passages.length;
      const counts = termCounts(tokens);
      index.passages.push({
        textId: work.id,
        title: work.title,
        author: work.author,
        length: tokens.length,
        start: chunk.start,
        end: chunk.end,
        passage: excerpt(chunk.text),
      });
      totalLength += tokens.length;
      for (const [term, tf] of counts) {
        let posting = index.postings.get(term);
        if (!posting) {
          posting = [];
          index.postings.set(term, posting);
        }
        posting.push([passageIndex, tf]);
      }
    }
  }

  index.avgLength = totalLength / Math.max(1, index.passages.length);
  index.ready = true;
  postMessage({ type: "ready", payload: { texts: works.length, passages: index.passages.length } });
}

function search({ query, sourceTextId, limit = 12 }) {
  if (!index.ready) return;
  const queryTokens = tokenize(query);
  const queryTerms = Array.from(new Set(queryTokens));
  const scores = new Map();
  const k1 = 1.5;
  const b = 0.75;
  const totalPassages = index.passages.length;

  for (const term of queryTerms) {
    const posting = index.postings.get(term);
    if (!posting) continue;
    const df = posting.length;
    const idf = Math.log(1 + (totalPassages - df + 0.5) / (df + 0.5));
    for (const [passageIndex, tf] of posting) {
      const passage = index.passages[passageIndex];
      if (passage.textId === sourceTextId) continue;
      const denominator = tf + k1 * (1 - b + b * (passage.length / index.avgLength));
      scores.set(passageIndex, (scores.get(passageIndex) || 0) + idf * ((tf * (k1 + 1)) / denominator));
    }
  }

  const bestByText = new Map();
  for (const [passageIndex, score] of scores) {
    const passage = index.passages[passageIndex];
    const current = bestByText.get(passage.textId);
    if (!current || score > current.score) {
      bestByText.set(passage.textId, { ...passage, score });
    }
  }

  const results = Array.from(bestByText.values())
    .sort((a, bValue) => bValue.score - a.score)
    .slice(0, limit);

  postMessage({
    type: "results",
    payload: {
      terms: queryTerms,
      results,
    },
  });
}

function tokenize(text) {
  return text
    .toLowerCase()
    .match(/[a-z][a-z']{1,}/g)
    ?.map((token) => token.replace(/^'+|'+$/g, ""))
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token)) || [];
}

function termCounts(tokens) {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

function chunkText(text) {
  const words = Array.from(text.matchAll(/\S+/g), (match) => ({
    value: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
  const size = 180;
  const stride = 90;
  const chunks = [];
  for (let start = 0; start < words.length; start += stride) {
    const part = words.slice(start, start + size);
    if (part.length < 80) break;
    chunks.push({
      text: part.map((word) => word.value).join(" "),
      start: part[0].start,
      end: part[part.length - 1].end,
    });
  }
  return chunks;
}

function excerpt(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 520 ? `${normalized.slice(0, 520)}...` : normalized;
}
