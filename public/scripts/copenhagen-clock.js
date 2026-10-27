(() => {
    const formatter = new Intl.DateTimeFormat("en-DK", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Copenhagen",
    });

    const update = () => {
        const now = new Date();
        document.querySelectorAll("[data-copenhagen-time]").forEach((element) => {
            element.textContent = formatter.format(now);
            element.setAttribute("datetime", now.toISOString());
        });
    };

    const scheduleNextUpdate = () => {
        const now = new Date();
        const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
        window.setTimeout(() => {
            update();
            scheduleNextUpdate();
        }, msUntilNextMinute);
    };

    update();
    scheduleNextUpdate();
})();
