import assert from "node:assert/strict";
import test from "node:test";

import { loadPublicSettingsForSession } from "../src/stores/public-settings-loader.ts";

test("fresh desktop cloud sessions sync model channels into the local API", async () => {
    const calls = [];
    const result = await loadPublicSettingsForSession(
        { baseUrl: "https://cloud.example.com", token: "access-token" },
        true,
        {
            loadLocal: async () => {
                calls.push("local");
                return "local settings";
            },
            loadCloud: async () => {
                calls.push("cloud");
                return "cloud settings";
            },
            syncDesktop: async () => {
                calls.push("desktop-sync");
                return "synced settings";
            },
        },
    );

    assert.equal(result, "synced settings");
    assert.deepEqual(calls, ["desktop-sync"]);
});
