const qualitySources = new Set([
    "532faeaf00b3b4dc",
    "318e89cb4b787dcf",
    "a9b0f4fa1ee8881f",
    "ade9f36f8940b434"
]);

const sourceId = msg.error?.source?.id;
const isQualityError = qualitySources.has(sourceId);

if (isQualityError && msg.liveQualityResponse) {
    // Preserve production data when only quality calculation fails.
    const response = msg.liveQualityResponse;

    Object.assign(response, {
        qualityDetails: {
            qualityAvailable: false,
            status: "quality-calculation-error"
        },
        qualityAvailable: false,
        totalQualityTiles: null,
        firstQuality: null,
        normalDamageQuality: null,
        cutDamageQuality: null,
        quality: null,
        ole: null
    });

    msg.statusCode = 200;
    msg.payload = response;

    delete msg.liveQualityGrades;
    delete msg.liveQualityResponse;

    node.warn(
        "Live quality calculation failed; production summary returned."
    );
} else {
    msg.statusCode = 500;
    msg.payload = {
        success: false,
        error: msg.error?.message || "InfluxDB live query failed"
    };
}

return msg;