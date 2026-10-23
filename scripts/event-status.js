(function () {
    "use strict";

    const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;
    const videoId = /^[A-Za-z0-9_-]{11}$/;
    const statuses = ["Placeholder", "Announced", "Registration open", "Completed"];

    function timestamp(value) {
        if (!value) return null;
        if (!isoTimestamp.test(value)) return NaN;
        const [hour, minute, second] = value.slice(11, 19).split(":").map(Number);
        if (hour > 23 || minute > 59 || second > 59) return NaN;
        const [year, month, day] = value.slice(0, 10).split("-").map(Number);
        const calendar = new Date(Date.UTC(year, month - 1, day));
        if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return NaN;
        return Date.parse(value);
    }

    function httpsUrl(value) {
        try {
            const url = new URL(value);
            return url.protocol === "https:" && !url.username && !url.password;
        } catch (error) {
            if (error instanceof TypeError) return false;
            throw error;
        }
    }

    function getEventState(data, now = Date.now()) {
        const starts = timestamp(data.startsAt);
        const ends = timestamp(data.endsAt);
        const closes = timestamp(data.registrationClosesAt);
        const invalid = !statuses.includes(data.status) || !Number.isFinite(now) ||
            [starts, ends, closes].some(Number.isNaN) ||
            ((starts !== null || ends !== null || closes !== null) && (starts === null || ends === null)) ||
            (starts !== null && ends <= starts) ||
            (closes !== null && closes > starts) ||
            (data.status === "Registration open" && (!data.registrationUrl || starts === null)) ||
            (data.status === "Placeholder" && starts !== null) ||
            (data.registrationUrl && !httpsUrl(data.registrationUrl)) ||
            (data.recordingYoutubeId && !videoId.test(data.recordingYoutubeId));

        if (invalid) {
            return {
                label: "Details need updating",
                message: "Event timing or links need correction. Please check with the organizers.",
                tagline: "Check with the organizers",
                href: null,
                error: "Invalid event status, timestamps, or links."
            };
        }

        const state = { label: data.status, message: data.dateLabel, tagline: data.tagline, href: null };
        if (data.status === "Placeholder") return state;

        if (data.status === "Completed" || (ends !== null && now >= ends)) {
            state.label = "Event ended";
            if (data.recordingYoutubeId) {
                state.message = "Recording now available on YouTube.";
                state.tagline = "Watch the recording on YouTube";
                state.href = "https://www.youtube.com/watch?v=" + data.recordingYoutubeId;
                state.action = "Watch the recording on YouTube";
            } else if (data.recordingExpected === "true") {
                state.message = "The event has ended. Recording on its way.";
                state.tagline = "Recording on its way";
            } else {
                state.message = "This event has ended. No recording is listed.";
                state.tagline = "View event details";
            }
            return state;
        }

        if (starts !== null && now >= starts) {
            state.label = "Event in progress";
            state.message = "The event has started. Registration is closed.";
            state.tagline = "The session is under way";
            return state;
        }

        if (closes !== null && now >= closes) {
            state.label = "Registration closed";
            state.message = "Registration has closed. Event: " + data.dateLabel;
            state.tagline = "Registration closed / View event details";
            return state;
        }

        if (data.status === "Registration open") {
            state.href = data.registrationUrl;
            state.action = "Register for this event";
        }
        return state;
    }

    function renderEvent(element, now) {
        const state = getEventState(element.dataset, now);
        if (state.error && !element.dataset.eventError) {
            console.error(state.error, element);
            element.dataset.eventError = "true";
        }
        for (const label of element.querySelectorAll("[data-event-label]")) label.textContent = state.label;
        for (const message of element.querySelectorAll("[data-event-message]")) message.textContent = state.message;
        for (const tagline of element.querySelectorAll("[data-event-tagline]")) tagline.textContent = state.tagline;
        for (const action of element.querySelectorAll("[data-event-action]")) {
            action.hidden = !state.href;
            action.querySelector("[data-event-action-text]").textContent = state.action || "";
            action.querySelector("[data-event-action-icon]").hidden = !state.href || !state.href.startsWith("https://www.youtube.com/");
            if (state.href) action.href = state.href;
            else action.removeAttribute("href");
        }
        element.classList.toggle("event-ended", state.label === "Event ended");
        return state;
    }

    if (typeof module !== "undefined" && module.exports) module.exports = { getEventState, renderEvent };
    if (typeof document === "undefined") return;

    function refresh() {
        const now = Date.now();
        for (const element of document.querySelectorAll("[data-event]")) renderEvent(element, now);
    }

    refresh();
    setInterval(refresh, 30000);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", function () {
        if (!document.hidden) refresh();
    });
    function guardAction(event) {
        const action = event.target.closest("[data-event-action]");
        if (!action) return;
        const previousHref = action.getAttribute("href");
        const state = renderEvent(action.closest("[data-event]"), Date.now());
        // Do not turn an expired registration click into a different navigation.
        if (!state.href || state.href !== previousHref) event.preventDefault();
    }
    document.addEventListener("click", guardAction);
    document.addEventListener("auxclick", guardAction);
}());
