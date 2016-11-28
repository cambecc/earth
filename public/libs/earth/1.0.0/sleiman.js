//public
var glAltitude, glGallonsPerMinute, glHillsHeight, glRayyanOnOFF;

//public const
var SolomonWidth = 770, SolomonHeight = 700; // These are the height and width of the rendering canvas
var glMonthToSimulate, glHourToSimulate, glSourceWaterTemperature, glPrmiaryWaterVolume, glSecondaryWaterVolume, glNetworkArea;

var glWindxOutput;
var glWindyOutput;
var glTemperatureOutput;
var glPressureOutput;

function SimulateClimate(MonthToSimulate, HourToSimulate, SourceWaterTemperature, Altitude, GallonsPerMinute,
                         PrimaryWaterVolume, SecondaryWaterVolume, HillsHeight, NetworkArea, RayyanOnOFF) {

    var GallonsPerMinuteScaled;

    if (MonthToSimulate === undefined) {
        MonthToSimulate = 7;
    }
    if (SourceWaterTemperature === undefined) {
        SourceWaterTemperature = 4;
    }
    else {
        SourceWaterTemperature = SourceWaterTemperature / 5;
    }
    if (Altitude === undefined) {
        Altitude = 0;
    }
    if (GallonsPerMinute === undefined) {
        GallonsPerMinuteScaled = 400000;
    }
    else {
        GallonsPerMinuteScaled = GallonsPerMinute * 100;
    }
    if (RayyanOnOFF === undefined) {
        RayyanOnOFF = 1;
    }

    var body = {
        "MonthToSimulate": MonthToSimulate,
        "SourceWaterTemperature": SourceWaterTemperature,
        "Altitude": Altitude,
        "GallonsPerMinute": GallonsPerMinute,
        "GallonsPerMinuteScaled": GallonsPerMinuteScaled,
        "RayyanOnOFF": RayyanOnOFF === 1
    };

    console.info('body', body);
    $.ajax({
        async: false,//wait till response to continue program
        type: "Post",
        contentType: 'application/json',
        url: baseUrl + "/api/simulate/" + simulationName,
        data: JSON.stringify(body),
        success: function (result) {
            console.log("result: ", result);
            glWindxOutput = result["windx"];
            glWindyOutput = result["windy"];
            glTemperatureOutput = result["temperature"];
            glPressureOutput = result["pressure"];
        },
        error: function (jqXHR, exception) {
            console.log("exception: ", exception);
        }
    });
}
