function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

var HeatSinkImageWidth = 110;
var HeatSinkImageHeight= 100;
var HeatSinkFromImageNumber=1476;

var simulationName = getParameterByName('SimulationType');

if (simulationName == "NorthPark")
{
  HeatSinkFromImageNumber = 4061;
}
else if (simulationName == "CentralPark")
{
  HeatSinkFromImageNumber = 3740;
}
else if (simulationName == "SouthPark")
{
  HeatSinkFromImageNumber = 3672;
}
else if (simulationName == "Full")
{
  HeatSinkFromImageNumber = 4653;
}


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

document.getElementById('show-menu').innerHTML = 'DCH ' + simulationName;
console.log("changing image");
//debugger
