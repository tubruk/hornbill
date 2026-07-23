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

  test("parseIcsHolidays extracts all-day event dates and titles", () => {
    const icsData = `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Example Corp//EN
BEGIN:VEVENT
UID:holiday-1
DTSTART;VALUE=DATE:20260817
SUMMARY:Independence Day
END:VEVENT
BEGIN:VEVENT
UID:holiday-2
DTSTART:20261225T000000Z
SUMMARY:Christmas Day
END:VEVENT
END:VCALENDAR
`;

    const parsed = parseIcsHolidays(icsData);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ date: "2026-08-17", name: "Independence Day" });
    expect(parsed[1]).toEqual({ date: "2026-12-25", name: "Christmas Day" });
  });
});
