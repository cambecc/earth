function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

var HeatSinkImageWidth = 88;
var HeatSinkImageHeight= 69;
var HeatSinkFromImageNumber=1476;

var simulationName = getParameterByName('simulationName');
if (!simulationName || simulationName == '') simulationName = 'Full';
var HeatSinkX;
$.getJSON('data/HeatSinkX_' + simulationName + '.json', function (json) {
    HeatSinkX = json;
});
var HeatSinkY;
$.getJSON('data/HeatSinkY_' + simulationName + '.json', function (json) {
    HeatSinkY = json;
});

document.getElementById('simulationBGImage').src = 'simulationImage_' + simulationName + ".png";
//debugger
