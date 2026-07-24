import { describe, test, expect } from "bun:test";
import {
  isNonWorkingDay,
  getActualPayday,
  getPayPeriodBounds,
  parseIcsHolidays,
} from "./payday";
import type { PaydayConfig } from "./types";

describe("Payday & Holiday Engine", () => {
  test("isNonWorkingDay correctly identifies weekends and holiday dates", () => {
    const holidays = new Set(["2026-07-24", "2026-08-17"]);

    // 2026-07-25 is Saturday, 2026-07-26 is Sunday
    expect(isNonWorkingDay(new Date(2026, 6, 25), holidays)).toBe(true);
    expect(isNonWorkingDay(new Date(2026, 6, 26), holidays)).toBe(true);

    // 2026-07-24 is Friday, but in holiday set
    expect(isNonWorkingDay(new Date(2026, 6, 24), holidays)).toBe(true);

    // 2026-07-23 is Thursday, not weekend, not holiday
    expect(isNonWorkingDay(new Date(2026, 6, 23), holidays)).toBe(false);
  });

  test("getActualPayday shifts dates based on previous_working_day rule", () => {
    const holidays = new Set<string>();

    // July 25, 2026 is Saturday -> shifts to Friday July 24
    expect(getActualPayday("2026-07-25", "previous_working_day", holidays)).toBe("2026-07-24");

    // If July 24 is a holiday -> shifts to Thursday July 23
    holidays.add("2026-07-24");
    expect(getActualPayday("2026-07-25", "previous_working_day", holidays)).toBe("2026-07-23");
  });

  test("getActualPayday shifts dates based on next_working_day and exact_date rules", () => {
    const holidays = new Set<string>();

    // July 25, 2026 is Saturday -> next_working_day shifts to Monday July 27
    expect(getActualPayday("2026-07-25", "next_working_day", holidays)).toBe("2026-07-27");

    // exact_date returns 2026-07-25 regardless of weekend
    expect(getActualPayday("2026-07-25", "exact_date", holidays)).toBe("2026-07-25");
  });

  test("getPayPeriodBounds calculates correct cycle bounds for reference dates", () => {
    const config: PaydayConfig = {
      enabled: true,
      frequency: "monthly",
      day_of_month: 25,
      adjustment: "previous_working_day",
    };

    // Reference date: 2026-07-24 (The actual July payday)
    // Next payday is Aug 25 (Tuesday) -> actual Aug 25
    const boundsOnPayday = getPayPeriodBounds("2026-07-24", config);
    expect(boundsOnPayday.start_date).toBe("2026-07-24");
    expect(boundsOnPayday.next_payday).toBe("2026-08-25");
    expect(boundsOnPayday.end_date).toBe("2026-08-24");

    // Reference date: 2026-07-20 (Before July payday)
    // Current cycle starts at June payday: June 25 (Thursday) and ends before July 24
    const boundsBeforePayday = getPayPeriodBounds("2026-07-20", config);
    expect(boundsBeforePayday.start_date).toBe("2026-06-25");
    expect(boundsBeforePayday.next_payday).toBe("2026-07-24");
    expect(boundsBeforePayday.end_date).toBe("2026-07-23");
  });

  test("getPayPeriodBounds handles semi_monthly, bi_weekly, and weekly frequencies", () => {
    const semiMonthlyConfig: PaydayConfig = {
      enabled: true,
      frequency: "semi_monthly",
      day_of_month: 15,
      adjustment: "previous_working_day",
    };

    // Semi-monthly reference date July 10 (< July 15 payday) -> current cycle starts June 15, next payday July 15
    const semiBounds = getPayPeriodBounds("2026-07-10", semiMonthlyConfig);
    expect(semiBounds.start_date).toBe("2026-06-15");
    expect(semiBounds.next_payday).toBe("2026-07-15");
    expect(semiBounds.end_date).toBe("2026-07-14");

    const weeklyConfig: PaydayConfig = {
      enabled: true,
      frequency: "weekly",
      day_of_month: 25,
      adjustment: "exact_date",
    };
    const weeklyBounds = getPayPeriodBounds("2026-07-25", weeklyConfig);
    expect(weeklyBounds.start_date).toBe("2026-07-25");
    expect(weeklyBounds.next_payday).toBe("2026-08-01");
    expect(weeklyBounds.end_date).toBe("2026-07-31");

    const biWeeklyConfig: PaydayConfig = {
      enabled: true,
      frequency: "bi_weekly",
      day_of_month: 25,
      adjustment: "exact_date",
    };
    const biWeeklyBounds = getPayPeriodBounds("2026-07-25", biWeeklyConfig);
    expect(biWeeklyBounds.start_date).toBe("2026-07-25");
    expect(biWeeklyBounds.next_payday).toBe("2026-08-08");
    expect(biWeeklyBounds.end_date).toBe("2026-08-07");
  });

  test("getPayPeriodBounds handles year rollover and month day clamping (31st day & Feb)", () => {
    const config: PaydayConfig = {
      enabled: true,
      frequency: "monthly",
      day_of_month: 31,
      adjustment: "exact_date",
    };

    // December 31 reference date -> next payday is Jan 31
    const decBounds = getPayPeriodBounds("2026-12-31", config);
    expect(decBounds.start_date).toBe("2026-12-31");
    expect(decBounds.next_payday).toBe("2027-01-31");
    expect(decBounds.end_date).toBe("2027-01-30");

    // January 31 reference date -> Feb clamped to Feb 28 (2026 is non-leap year)
    const janBounds = getPayPeriodBounds("2026-01-31", config);
    expect(janBounds.start_date).toBe("2026-01-31");
    expect(janBounds.next_payday).toBe("2026-02-28");
    expect(janBounds.end_date).toBe("2026-02-27");
  });

  test("parseIcsHolidays handles malformed content, multiline SUMMARYs, and empty inputs gracefully", () => {
    expect(parseIcsHolidays("")).toEqual([]);
    expect(parseIcsHolidays("NOT AN ICS FILE")).toEqual([]);

    const messyIcs = `
BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:New Year's Day
DTSTART:20260101
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20260704T090000
SUMMARY:4th of July
END:VEVENT
END:VCALENDAR
`;
    const parsed = parseIcsHolidays(messyIcs);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ date: "2026-01-01", name: "New Year's Day" });
    expect(parsed[1]).toEqual({ date: "2026-07-04", name: "4th of July" });
  });
});
