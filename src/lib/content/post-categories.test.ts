import { describe, expect, it } from "vitest";
import { usedCategories } from "./post-categories";

describe("usedCategories", () => {
  it("usedCategories_noPosts_isEmpty", () => {
    expect(usedCategories([])).toEqual([]);
  });

  it("usedCategories_repeatedCategory_listedOnce", () => {
    expect(usedCategories([{ category: "Faith" }, { category: "Faith" }])).toEqual(["Faith"]);
  });

  it("usedCategories_anyPostOrder_followsSiteOrder", () => {
    expect(usedCategories([{ category: "Engineering" }, { category: "Bible Study" }])).toEqual(["Bible Study", "Engineering"]);
  });
});
