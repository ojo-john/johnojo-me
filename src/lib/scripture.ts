/**
 * Scripture passages quoted on the site. Only public-domain translations are quoted in full; the
 * World English Bible (WEB) is used by default. Every reference also links to the full passage.
 * Add a passage here once, then reference it from any post with <Ref k="Book 1:2" />.
 */
export interface Passage {
  ref: string;
  text: string;
  translation: "WEB";
}

const PASSAGES: Record<string, Omit<Passage, "translation">> = {
  "Hebrews 11:8-10": {
    ref: "Hebrews 11:8–10",
    text: "By faith, Abraham, when he was called, obeyed to go out to the place which he was to receive for an inheritance. He went out, not knowing where he went. By faith, he lived as an alien in the land of promise, as in a land not his own, dwelling in tents with Isaac and Jacob, the heirs with him of the same promise. For he looked for the city which has the foundations, whose builder and maker is God.",
  },
  "Genesis 12:1": {
    ref: "Genesis 12:1",
    text: "Now Yahweh said to Abram, “Leave your country, and your relatives, and your father’s house, to the land that I will show you.”",
  },
  "Hebrews 11:13": {
    ref: "Hebrews 11:13",
    text: "These all died in faith, not having received the promises, but having seen them and embraced them from afar, and having confessed that they were strangers and pilgrims on the earth.",
  },
  "Hebrews 11:16": {
    ref: "Hebrews 11:16",
    text: "But now they desire a better country, that is, a heavenly one. Therefore God is not ashamed of them, to be called their God, for he has prepared a city for them.",
  },
  "Psalm 121:8": {
    ref: "Psalm 121:8",
    text: "Yahweh will keep your going out and your coming in, from this time forward, and forevermore.",
  },
};

export function passage(key: string): Passage {
  const p = PASSAGES[key];
  if (!p) throw new Error(`Unknown scripture reference "${key}". Add it to src/lib/scripture.ts.`);
  return { ...p, translation: "WEB" };
}

export const passageUrl = (key: string) => `https://www.biblegateway.com/passage/?search=${encodeURIComponent(key)}&version=WEB`;
