function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

var simulationName = getParameterByName('SimulationType');

document.getElementById('simulationBGImage').src = 'simulationImage_' + simulationName + ".png";

document.getElementById('show-menu').innerHTML = 'DCH ' + simulationName;
console.log("changing image");
//debugger
