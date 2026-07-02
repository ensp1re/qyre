import { describe, expect, it } from "vitest";
import { EventLog } from "./event-log.js";

describe("EventLog", () => {
  it("returns logged events in order with incrementing ids and a timestamp", () => {
    const log = new EventLog();
    log.log("info", "first");
    log.log("warn", "second");

    const events = log.list();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ id: 1, level: "info", message: "first" });
    expect(events[1]).toMatchObject({ id: 2, level: "warn", message: "second" });
    expect(typeof events[0]?.timestamp).toBe("string");
  });

  it("drops the oldest entry once the cap is exceeded", () => {
    const log = new EventLog();
    for (let i = 0; i < 201; i += 1) {
      log.log("info", `event ${i}`);
    }

    const events = log.list();
    expect(events).toHaveLength(200);
    expect(events[0]?.message).toBe("event 1");
    expect(events[199]?.message).toBe("event 200");
  });

  it("clears all events", () => {
    const log = new EventLog();
    log.log("info", "first");
    log.clear();

    expect(log.list()).toEqual([]);
  });
});
