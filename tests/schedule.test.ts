import { describe, expect, it } from "vitest";
import { comingLabel, hiddenNote, isDue, isTeased, somethingDue, todayIn } from "@/lib/content/schedule";

describe("todayIn", () => {
  it("todayIn_justAfterMidnightUtc_isStillYesterdayInDallas", () => {
    expect(todayIn("America/Chicago", new Date("2026-11-15T03:00:00Z"))).toBe("2026-11-14");
  });

  it("todayIn_afterMidnightInDallas_isTheNewDay", () => {
    expect(todayIn("America/Chicago", new Date("2026-11-15T06:15:00Z"))).toBe("2026-11-15");
  });

  it("todayIn_unknownTimeZone_throws", () => {
    expect(() => todayIn("Mars/Olympus", new Date())).toThrow(RangeError);
  });
});

describe("isDue", () => {
  it("isDue_noDate_isLive", () => {
    expect(isDue(undefined, "2026-10-30")).toBe(true);
  });

  it("isDue_future_isHidden", () => {
    expect(isDue("2026-10-31", "2026-10-30")).toBe(false);
  });

  it("isDue_today_isLive", () => {
    expect(isDue("2026-10-30", "2026-10-30")).toBe(true);
  });

  it("isDue_monthOnly_meansItsFirstDay", () => {
    expect([isDue("2026-11", "2026-10-31"), isDue("2026-11", "2026-11-01")]).toEqual([false, true]);
  });
});

describe("somethingDue", () => {
  it("somethingDue_dueToday_rebuilds", () => {
    expect(somethingDue(["2026-12-01", "2026-10-30"], "2026-10-30", "2026-10-29")).toBe(true);
  });

  it("somethingDue_dueYesterday_rebuildsInCaseThatRunWasMissed", () => {
    expect(somethingDue(["2026-10-29"], "2026-10-30", "2026-10-29")).toBe(true);
  });

  it("somethingDue_longPast_doesNothing", () => {
    expect(somethingDue(["2026-01-01"], "2026-10-30", "2026-10-29")).toBe(false);
  });

  it("somethingDue_nothingScheduled_doesNothing", () => {
    expect(somethingDue([], "2026-10-30", "2026-10-29")).toBe(false);
  });
});

describe("hiddenNote", () => {
  it("hiddenNote_draft_saysNotPublic", () => {
    expect(hiddenNote("draft", undefined, "2026-10-31")).toBe("Draft · not public");
  });

  it("hiddenNote_scheduledLater_givesTheDate", () => {
    expect(hiddenNote("published", "2026-11-04", "2026-10-31")).toBe("Hidden until 4 Nov 2026");
  });

  it("hiddenNote_dueToday_isPublic", () => {
    expect(hiddenNote("published", "2026-11-04", "2026-11-04")).toBeNull();
  });

  it("hiddenNote_monthOnly_usesTheFirst", () => {
    expect(hiddenNote("published", "2026-12", "2026-10-31")).toBe("Hidden until 1 Dec 2026");
  });

  it("hiddenNote_noDate_isPublic", () => {
    expect(hiddenNote("published", undefined, "2026-10-31")).toBeNull();
  });
});

describe("coming soon", () => {
  it("hiddenNote_comingSoonLater_saysTeaser", () => {
    expect(hiddenNote("coming-soon", "2026-11-04", "2026-11-02")).toBe("Coming-soon teaser until 4 Nov 2026");
  });

  it("isTeased_comingSoonWithFutureDate_isTeased", () => {
    expect(isTeased("coming-soon", "2026-11-04", "2026-11-02")).toBe(true);
  });

  it("isTeased_dateArrived_isPublishedNotTeased", () => {
    expect(isTeased("coming-soon", "2026-11-04", "2026-11-04")).toBe(false);
  });

  it("isTeased_noDate_isNotTeased", () => {
    expect(isTeased("coming-soon", undefined, "2026-11-02")).toBe(false);
  });

  it("isTeased_publishedWithFutureDate_staysHidden", () => {
    expect(isTeased("published", "2026-11-04", "2026-11-02")).toBe(false);
  });

  it("comingLabel_thisYear_leavesYearOut", () => {
    expect(comingLabel("2026-11-04", "2026-11-02")).toBe("Coming 4 Nov");
  });

  it("comingLabel_nextYear_includesYear", () => {
    expect(comingLabel("2027-01", "2026-11-02")).toBe("Coming 1 Jan 2027");
  });
});

