export class Utils {
    /**
     * Port of Python's string.split()[1].split()[0]
     */
    static between(mainText, value1, value2) {
        if (!mainText || !mainText.includes(value1)) return "";
        try {
            return mainText.split(value1)[1].split(value2)[0];
        } catch (e) {
            return "";
        }
    }
}

export class Run {
    static handleError(error) {
        console.error(`[ERROR] ${error}`);
    }
}
