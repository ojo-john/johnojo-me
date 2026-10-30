import { describe, expect, it } from "vitest";
import { isoDuration, recipeJsonLd, timeLabel, totalMinutes } from "@/lib/content/recipe";
import { post } from "@/lib/content/schema";

const recipeOf = (over: Record<string, unknown> = {}) => ({ ingredients: ["2 cups rice"], steps: ["Wash the rice."], ...over });
const frontmatter = (over: Record<string, unknown> = {}) => ({ title: "Jollof rice", dek: "Party-style", category: "Recipes", status: "published", recipe: recipeOf(), ...over });

describe("isoDuration", () => {
  it("isoDuration_minutesOnly_isPTnM", () => {
    expect(isoDuration(45)).toBe("PT45M");
  });

  it("isoDuration_hoursAndMinutes_combines", () => {
    expect(isoDuration(90)).toBe("PT1H30M");
  });

  it("isoDuration_wholeHours_dropsMinutes", () => {
    expect(isoDuration(120)).toBe("PT2H");
  });

  it("isoDuration_zero_isPT0M", () => {
    expect(isoDuration(0)).toBe("PT0M");
  });

  it("isoDuration_missing_isUndefined", () => {
    expect(isoDuration(undefined)).toBeUndefined();
  });
});

describe("timeLabel", () => {
  it("timeLabel_overAnHour_showsBoth", () => {
    expect(timeLabel(75)).toBe("1 hr 15 min");
  });

  it("timeLabel_underAnHour_minutesOnly", () => {
    expect(timeLabel(20)).toBe("20 min");
  });
});

describe("totalMinutes", () => {
  it("totalMinutes_onlyCookTime_isCookTime", () => {
    expect(totalMinutes(recipeOf({ cookMinutes: 40 }) as never)).toBe(40);
  });

  it("totalMinutes_noTimes_isUndefined", () => {
    expect(totalMinutes(recipeOf() as never)).toBeUndefined();
  });
});

describe("recipeJsonLd", () => {
  it("recipeJsonLd_fullRecipe_matchesSchemaOrgShape", () => {
    const ld = recipeJsonLd({ title: "Jollof rice", dek: "Party-style", publishedAt: "2026-11-01", recipe: recipeOf({ servings: "4", prepMinutes: 15, cookMinutes: 45, cuisine: "Nigerian" }) as never }, "John Ojo", "https://johnojo.me/journal/jollof/");
    expect(ld).toMatchObject({ "@type": "Recipe", recipeYield: "4", recipeCuisine: "Nigerian", prepTime: "PT15M", cookTime: "PT45M", totalTime: "PT1H", recipeIngredient: ["2 cups rice"], recipeInstructions: [{ "@type": "HowToStep", position: 1, text: "Wash the rice." }] });
  });

  it("recipeJsonLd_noTimes_leavesTimeFieldsOut", () => {
    const ld = recipeJsonLd({ title: "T", dek: "D", recipe: recipeOf() as never }, "John Ojo", "https://johnojo.me/journal/t/");
    expect(["prepTime", "cookTime", "totalTime"].some((k) => k in ld)).toBe(false);
  });
});

describe("post schema and recipes", () => {
  it("post_recipesPostWithCard_isValid", () => {
    expect(post.safeParse(frontmatter()).success).toBe(true);
  });

  it("post_recipesPostWithoutCard_isRejected", () => {
    expect(post.safeParse(frontmatter({ recipe: undefined })).success).toBe(false);
  });

  it("post_faithPostWithRecipeCard_isRejected", () => {
    expect(post.safeParse(frontmatter({ category: "Faith" })).success).toBe(false);
  });

  it("post_recipeWithNoSteps_isRejected", () => {
    expect(post.safeParse(frontmatter({ recipe: recipeOf({ steps: [] }) })).success).toBe(false);
  });

  it("post_faithPostWithoutCard_isUnchanged", () => {
    expect(post.safeParse(frontmatter({ category: "Faith", recipe: undefined })).success).toBe(true);
  });
});
