/**
 * In-memory card image preloading cache.
 * Preloads and decodes in GPU memory all cards in both players' decks,
 * extra/fusion decks, and common assets (Back_Image, tokens) during duel startup.
 */

const inMemoryCardImages = new Map();

/**
 * Preload all cards required for a duel into browser memory / GPU texture cache.
 */
export async function preloadDuelImages({
  deck,
  opponentDeck,
  cardImagePath,
  getCard,
  backImagePath = typeof window !== "undefined" && document.body?.classList?.contains("ipad-edition")
    ? "./goat-card-images/Back_Image.webp"
    : "./goat-card-images/Back_Image.jpg",
}) {
  if (typeof window === "undefined" || typeof Image === "undefined") return;

  const cardIds = new Set();

  const collectDeckCards = (d) => {
    if (!d) return;
    for (const id of d.main ?? []) if (id !== null && id !== undefined) cardIds.add(Number(id));
    for (const id of d.fusion ?? []) if (id !== null && id !== undefined) cardIds.add(Number(id));
    for (const id of d.side ?? []) if (id !== null && id !== undefined) cardIds.add(Number(id));
  };

  collectDeckCards(deck);
  collectDeckCards(opponentDeck);

  const urls = new Set();
  if (backImagePath) urls.add(backImagePath);

  for (const id of cardIds) {
    const card = getCard ? getCard(id) : null;
    if (card) {
      const url = cardImagePath(card);
      if (url) urls.add(url);
    }
  }

  const tasks = [...urls].map(async (url) => {
    if (inMemoryCardImages.has(url)) return inMemoryCardImages.get(url);
    try {
      const img = new Image();
      img.src = url;
      img.decoding = "async";
      if (typeof img.decode === "function") {
        await img.decode();
      }
      inMemoryCardImages.set(url, img);
      return img;
    } catch {
      // Fallback: non-fatal, browser will fetch via normal tag if needed
      return null;
    }
  });

  await Promise.allSettled(tasks);
}

/**
 * Check if a card image is already in memory.
 */
export function isCardImagePreloaded(url) {
  return inMemoryCardImages.has(url);
}
