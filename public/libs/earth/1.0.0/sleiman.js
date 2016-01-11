

// function ClimateNode (Temp, Press, Windx, Windy, Windz)


   var SolomonWidth = 900, SolomonHeight = 705; // These are the height and width of the rendering canvas

   var Kair = 0.000019; // Thermal diffusivity of Air
   var AirTempVelConst = 0.01; // Effect of temperature difference on air velocity
   var Maxx = 1000;
   var Maxy =  500;
   var Maxz =  500;
   var GridResolutionx= HeatSinkImageWidth-4;
   var GridResolutiony= HeatSinkImageHeight-4;
   var GridResolutionz= 10;
   var Gridbuffer = 4; // 2 data points on each side
   var LocationX = 136;  //Between 0 and 360
   var LocationY = 56;  // between 0 and 181
   var FillerBefore = LocationY*360+LocationX;
   var FillerBetween = 360- GridResolutionx - Gridbuffer;
   var FillerAfter   = 360* (180 - (LocationY + GridResolutiony+ Gridbuffer)) + 360 - LocationX;// - GridResolutionx - Gridbuffer;
   var FillerContent = 0;
   var DistanceResolutionx = Maxx/GridResolutionx;
   var DistanceResolutiony = Maxy/GridResolutiony;
   var DistanceResolutionz = Maxz/GridResolutionz;
   var TimeStep = 30; // this is in seconds. 300 sec = 5 mins, so 12 steps would be 1 hour
   var DataTimeStep = 3600; // This is in seconds. It the time we take between climate Snapshots
   var NumOfSamplesToCollect = 1; // This is the number of climate Snapshots to collect
   var NumOfTimeStepsperSample = DataTimeStep/TimeStep; // This is the total number of timeSteps for the calculation
   var SolarIrradiancePerHourMetersquared = 5400;
   var SolarIrradiancePersecond = SolarIrradiancePerHourMetersquared/(3600); // SolarHeat per second per squared distance used
   var ReverseSolarIrradiancePerHourMetersquared =      1600;
   var ReverseSolarIrradiancePersecondTempRatio  =   70/3600;
   var ReverseSolarIrradiancePersecond = ReverseSolarIrradiancePerHourMetersquared/(3600); //Heat transmitted to the sky through irradiance
   var HeatAveDepth = 10; // Assuming 10 m average depth penetration for heat
   var SoilThermalCapacityperm3 = 2.25 * 0.00277778; // 2.25 is average and 277.778 is to convert from MJ to Wh
   var SoilThermalCapacity = SoilThermalCapacityperm3/HeatAveDepth;

   var HeatSinkNetNumX = HeatSinkFromImageNumber;
   var HeatSinkNetNumY = 1;
//   var HeatSinkX = new Array (HeatSinkNetNumX*HeatSinkNetNumY);
//   var HeatSinkY = new Array (HeatSinkNetNumX*HeatSinkNetNumY);

   var SourcewaterTemp =4;
   var GoalTemp = 22;
   var WaterSpecificHeat = 4000 * 0.000277778; // 4000 is average and 0.000277778 is to convert from J to Wh
   var TotalWaterflow = 400000/(24*60*60); // Total water flow in KG/s
   var WaterflowPerNode = TotalWaterflow/(HeatSinkNetNumX*HeatSinkNetNumY);
   var TransferEfficiency = 0.93;
   var HeatSinkNetEnergyGapPerSec= TransferEfficiency*WaterflowPerNode* WaterSpecificHeat;

   var glTotalGridSize= 360*181;
   var glWindxOutput = new Array(glTotalGridSize);
   var glWindyOutput = new Array(glTotalGridSize);
   var glTemperatureOutput = new Array(glTotalGridSize);
   var glPressureOutput = new Array(glTotalGridSize);
   var glMonthToSimulate, glHourToSimulate, glSourceWaterTemperature, glAltitude, glGallonsPerMinute, glPrmiaryWaterVolume, glSecondaryWaterVolume, glHillsHeight, glNetworkArea;

function createNetworkLine (startingIndex, startingX, startingY, Xratio, Yratio, lineLength)
{

  for (var i=0; i < lineLength; i++)
  {

    HeatSinkX[startingIndex+i]= Math.round(startingX+i*Xratio);
    HeatSinkY[startingIndex+i]= Math.round(startingY +i*Yratio);

    console.log(HeatSinkX[startingIndex+i]);
    console.log(HeatSinkY[startingIndex+i]);
  }
}
function createNetworkArc(startingIndex, startingX, startingY, centerX, centerY, arcLength)
{

  HeatSinkX[startingIndex]=startingX;
  HeatSinkY[startingIndex]=startingY;

  var sSin = -(startingY - centerY); // sign of sin  +ve or -ve flipped because y is downwards
  var sCos = startingX - centerX; //sing of cos
  var eps = 0.000001;  // this is to make sure that we don't have infinite ratios
  var ratio= (Math.abs(sSin) +eps)/(Math.abs(sCos)+eps);
  var tan225 = 0.41421356237; // Tan(22.5 degrees)
  var tan675 = 2.41421356237; // Tan(67.5 degrees)
  var currentX,currentY,nextX,nextY;
  currentX=startingX;
  currentY=startingY;

  for (i=1; i < arcLength; i++)
  {
    if (ratio <tan225)
    {
            // X is much longer than Y, so the direction is horizontal
      if (sCos >0)
      { // current direction is East
        nextX = currentX;
        nextY= currentY+1;
      }
      else
      { // Current Direction is West
        nextX= currentX;
        nextY= currentY-1;
      }
    }
    else if (ratio > tan675)
    {
      if(sSin > 0)
      {  // Current Direction is North
        nextX = currentX +1;
        nextY = currentY;
      }
      else
      {    //Current Direction is South
        nextX = currentX -1;
        nextY = currentY;
      }
    }
    else
    {
      if (sCos>0)
      {
        if (sSin >0)
        { // Current Direction is NorthEast
          nextX = currentX +1;
          nextY = currentY +1;

        }
        else
        { // Current Direction is SouthEast
          nextX = currentX -1;
          nextY = currentY +1;

        }
      }
      else
      {
        if (sSin >0)
        { // Current Direction is NorthWest
          nextX = currentX +1;
          nextY = currentY -1;

        }
        else
        { // Current Direction is SouthWest
          nextX = currentX -1;
          nextY = currentY -1;
        }
      }
    }

    currentX = nextX;
    currentY = nextY;
    sSin =  -(currentY - centerY); // again, flipped because y is downwards
    sCos =  currentX - centerX;
    ratio= (Math.abs(sSin) +eps)/(Math.abs(sCos)+eps);

    HeatSinkX[startingIndex+i]= currentX;
    HeatSinkY[startingIndex+i]= currentY;
    // console.log(HeatSinkX[startingIndex+i]);
    // console.log(HeatSinkY[startingIndex+i]);
  }

}

function createNetworkGrid (startingIndex, startingX, startingY, XStep, YStep, XNum, YNum)
{
  for(var k=0; k<XNum* YNum;k++)
  {
      var i =k%HeatSinkNetNumX;
      var j= (k-i)/HeatSinkNetNumX;
      HeatSinkX[k]= Gridbuffer/2+2 + XStep*i;
      HeatSinkY[k]= Gridbuffer/2+2 + YStep*j;
  }
}

 function createNetworkStarryNight(startingIndex, startingX, startingY, XStep, YStep, XNum, YNum)
 {
   for(var k=0; k<XNum* YNum;k++)
   {
       var i =k%HeatSinkNetNumX;
       var j= (k-i)/HeatSinkNetNumX;
       HeatSinkX[k]= Gridbuffer/2+2 + XStep*i;
       HeatSinkY[k]= Gridbuffer/2+2 + YStep*j;
       if (i%2 ==1)
       {
        HeatSinkY[k]=HeatSinkY[k] + Math.floor(YStep/2);
       }
  }
}

function setUpHeatSinks()
{
  // createNetworkLine (0, 72, 16, -0.25, 0.75, 19);
  // createNetworkArc  (19, 10, 10, 13, 18, 17);
  // for (var i=36; i < HeatSinkNetNumX*HeatSinkNetNumY; i++ )
  // {
  //   HeatSinkX[i]=1;
  //   HeatSinkY[i]=1;
  // }
}

function TemperatureUpdate (Temperaturet, Temperaturet1, WindVelocity, currentSolarIrradiance){

	var TempGradientSquared;
	var Temp2ndDer;

var DM= new Array(3);
for (i=0; i<3;i++){

	DM[i]= new Array(3);
	for (j=0; j<3;j++)
	{
		DM[i][j]= new Array(3);
	}
}

var DMKeepPertimeStep = 0.6;

var DMCorRatio  = 0.6;
var DMEdgeRatio = 0.5;

var DMNormSum =(1-DMKeepPertimeStep )/(8*DMCorRatio + 12*DMEdgeRatio + 6);
var DMCornerWeight= DMCorRatio*DMNormSum;
var DMEdgeWeight = DMEdgeRatio*DMNormSum;

// Previous Corners (x-1)

DM[0][0][0] = DMCornerWeight;
DM[0][0][2] = DMCornerWeight;
DM[0][2][0] = DMCornerWeight;
DM[0][2][2] = DMCornerWeight;

// Previous edges

DM[0][0][1] = DMEdgeWeight;
DM[0][1][0] = DMEdgeWeight;
DM[0][1][2] = DMEdgeWeight;
DM[0][2][1] = DMEdgeWeight;

// Previous center

DM[0][1][1] = DMNormSum;

// Current corners (similar to edges on other times)

DM[1][0][0] = DMEdgeWeight;
DM[1][0][2] = DMEdgeWeight;
DM[1][2][0] = DMEdgeWeight;
DM[1][2][2] = DMEdgeWeight;

// Current edges (similar to centers on other times)
DM[1][0][1] = DMNormSum;
DM[1][1][0] = DMNormSum;
DM[1][1][2] = DMNormSum;
DM[1][2][1] = DMNormSum;

// current center

DM[1][1][1] = DMKeepPertimeStep;

// Next corners

DM[2][0][0] = DMCornerWeight;
DM[2][0][2] = DMCornerWeight;
DM[2][2][0] = DMCornerWeight;
DM[2][2][2] = DMCornerWeight;

// Next Edges

DM[2][0][1] = DMEdgeWeight;
DM[2][1][0] = DMEdgeWeight;
DM[2][1][2] = DMEdgeWeight;
DM[2][2][1] = DMEdgeWeight;

// Next Center

DM[2][1][1] = DMNormSum;


// First we update the heat equation

	for (var i = 0; i < GridResolutionx+Gridbuffer-2; i++) {
		for (var j = 0; j < GridResolutiony+Gridbuffer-2; j++) {
			for (var k = 0; k < GridResolutionz+Gridbuffer-2; k++) {

				Temperaturet1[i+1][j+1][k+1] =0;

				for(var mi = 0; mi <3; mi++){
					for (var mj = 0; mj <3; mj++){
						for(var mk = 0; mk <3; mk++){
							Temperaturet1[i+1][j+1][k+1]+= DM[mi][mj][mk]*Temperaturet[i+mi][j+mj][k+mk];
						}
					}
				}


				WindVelocity[i+1][j+1][k+1][0]=((Temperaturet[i+2][j+1][k+1]-Temperaturet[i][j+1][k+1])/(2*DistanceResolutionx));
				WindVelocity[i+1][j+1][k+1][1]=((Temperaturet[i+1][j+2][k+1]-Temperaturet[i+1][j][k+1])/(2*DistanceResolutiony));
				WindVelocity[i+1][j+1][k+1][2]=((Temperaturet[i+1][j+1][k+2]-Temperaturet[i+1][j+1][k])/(2*DistanceResolutionz));
/*
    			TempGradient = WindVelocity[i+1][j+1][k+1][0]* Math.abs(WindVelocity[i+1][j+1][k+1][0]) + WindVelocity[i+1][j+1][k+1][1]* Math.abs(WindVelocity[i+1][j+1][k+1][1])+ WindVelocity[i+1][j+1][k+1][2]*Math.abs(WindVelocity[i+1][j+1][k+1][2]);

    			Temp2ndDer = (Temperaturet[i+2][j+1][k+1]+Temperaturet[i][j+1][k+1] -2*Temperaturet[i+1][j+1][k+1])/(DistanceResolutionx*DistanceResolutionx) + (Temperaturet[i+1][j+2][k+1]+Temperaturet[i+1][j][k+1] -2*Temperaturet[i+1][j+1][k+1])/(DistanceResolutiony*DistanceResolutiony) + (Temperaturet[i+1][j+1][k+2]+Temperaturet[i+1][j+1][k] -2*Temperaturet[i+1][j+1][k+1])/(DistanceResolutionz*DistanceResolutionz);

    			Temperaturet1[i+1][j+1][k+1] = Temperaturet[i+1][j+1][k+1] + TimeStep *(AirTempVelConst*TempGradient+ Kair*Temp2ndDer);
*/
    			WindVelocity[i+1][j+1][k+1][0]=AirTempVelConst*WindVelocity[i+1][j+1][k+1][0];
				WindVelocity[i+1][j+1][k+1][1]=AirTempVelConst*WindVelocity[i+1][j+1][k+1][1];
				WindVelocity[i+1][j+1][k+1][2]=AirTempVelConst*WindVelocity[i+1][j+1][k+1][2];






				//console.log(i);
				//console.log(j);
				//console.log(k);
				//console.log(WindVelocity[i+1][j+1][k+1][1]* Math.abs(WindVelocity[i+1][j+1][k+1][1]));
				//console.log(WindVelocity[i+1][j+1][k+1][2]* Math.abs(WindVelocity[i+1][j+1][k+1][2]));
				//console.log(WindVelocity[i+1][j+1][k+1][3]* Math.abs(WindVelocity[i+1][j+1][k+1][3]));
   			//	console.log(TempGradient);


			}
		}
	}

// We then add the solar radiation on the soil (z=0 originally, but accounting for the grid buffer)
for (var i=1; i<GridResolutionx+Gridbuffer-1; i++){
	for (var j=1; j<GridResolutiony+Gridbuffer-1;j++){
		//console.log(Temperaturet1[i][j][Gridbuffer/2]);
		Temperaturet1[i][j][Gridbuffer/2] = Temperaturet1[i][j][Gridbuffer/2] + TimeStep * SoilThermalCapacity*currentSolarIrradiance;
		//console.log(Temperaturet1[i][j][Gridbuffer/2]);
		Temperaturet1[i][j][Gridbuffer/2] = Temperaturet1[i][j][Gridbuffer/2] - TimeStep * SoilThermalCapacity*(ReverseSolarIrradiancePersecond + ReverseSolarIrradiancePersecondTempRatio * Temperaturet1[i][j][Gridbuffer/2]);
		//console.log(Temperaturet1[i][j][Gridbuffer/2]);
	}
}

// We then Add the network sinks (also at z=0 originally)

for (var k=0; k<HeatSinkNetNumX* HeatSinkNetNumY;k++)
{

  if (Temperaturet1[HeatSinkX[k]][HeatSinkY[k]][Gridbuffer/2] - TimeStep * HeatSinkNetEnergyGapPerSec * (Temperaturet1[HeatSinkX[k]][HeatSinkY[k]][Gridbuffer/2] - SourcewaterTemp) >SourcewaterTemp)
  {
    Temperaturet1[HeatSinkX[k]][HeatSinkY[k]][Gridbuffer/2] = Temperaturet1[HeatSinkX[k]][HeatSinkY[k]][Gridbuffer/2] - TimeStep * HeatSinkNetEnergyGapPerSec * (Temperaturet1[HeatSinkX[k]][HeatSinkY[k]][Gridbuffer/2] - SourcewaterTemp) ;
  }
  else
  {
    Temperaturet1[HeatSinkX[k]][HeatSinkY[k]][Gridbuffer/2] = SourcewaterTemp;
  }

}
/*
for (var i=0; i<HeatSinkNetNumX; i++){
	for (var j=0; j<HeatSinkNetNumY;j++){
		if (Temperaturet1[HeatSinkX[i]][HeatSinkY[j]][Gridbuffer/2] - TimeStep * HeatSinkNetEnergyGapPerSec * (Temperaturet1[HeatSinkX[i]][HeatSinkY[j]][Gridbuffer/2] - SourcewaterTemp) >SourcewaterTemp)
		{
		Temperaturet1[HeatSinkX[i]][HeatSinkY[j]][Gridbuffer/2] = Temperaturet1[HeatSinkX[i]][HeatSinkY[j]][Gridbuffer/2] - TimeStep * HeatSinkNetEnergyGapPerSec * (Temperaturet1[HeatSinkX[i]][HeatSinkY[j]][Gridbuffer/2] - SourcewaterTemp) ;
		}
		else
		{
			Temperaturet1[HeatSinkX[i]][HeatSinkY[j]][Gridbuffer/2] = SourcewaterTemp;
		}
		//console.log(Temperaturet1[HeatSinkX[i]][HeatSinkY[j]][Gridbuffer] );
	}
}
*/

// We finally update the boundary conditions these are the six faces of the grid in the cube... Very annoying since we have to do vertices, lines, and internal faces. The easiest thing to do is to just "reflect" the internal points

for(var i=0;i<GridResolutionx+Gridbuffer;i++){
	for(var j=0;j<GridResolutiony+Gridbuffer;j++){

		Temperaturet1[i][j][0]=Temperaturet1[i][j][2];
		Temperaturet1[i][j][GridResolutionz+Gridbuffer-1]=Temperaturet1[i][j][GridResolutionz+Gridbuffer-3];
		WindVelocity[i][j][0][0]=WindVelocity[i][j][2][0];
		WindVelocity[i][j][GridResolutionz+Gridbuffer-1][0]=WindVelocity[i][j][GridResolutionz+Gridbuffer-3][0];
		WindVelocity[i][j][0][1]=WindVelocity[i][j][2][1];
		WindVelocity[i][j][GridResolutionz+Gridbuffer-1][1]=WindVelocity[i][j][GridResolutionz+Gridbuffer-3][1];
		WindVelocity[i][j][0][2]=WindVelocity[i][j][2][2];
		WindVelocity[i][j][GridResolutionz+Gridbuffer-1][2]=WindVelocity[i][j][GridResolutionz+Gridbuffer-3][2];
	}
}

for(var j=0;j<GridResolutiony+Gridbuffer;j++){
	for (var k=0; k < GridResolutionz+Gridbuffer;k++){

		Temperaturet1[0][j][k]=Temperaturet1[2][j][k];
		Temperaturet1[GridResolutionx+Gridbuffer-1][j][k]=Temperaturet1[GridResolutionx+Gridbuffer-3][j][k];
		WindVelocity[0][j][k][0]=WindVelocity[2][j][k][0];
		WindVelocity[GridResolutionx+Gridbuffer-1][j][k][0]=WindVelocity[GridResolutionx+Gridbuffer-3][j][k][0];
		WindVelocity[0][j][k][1]=WindVelocity[2][j][k][1];
		WindVelocity[GridResolutionx+Gridbuffer-1][j][k][1]=WindVelocity[GridResolutionx+Gridbuffer-3][j][k][1];
		WindVelocity[0][j][k][2]=WindVelocity[2][j][k][2];
		WindVelocity[GridResolutionx+Gridbuffer-1][j][k][2]=WindVelocity[GridResolutionx+Gridbuffer-3][j][k][2];

	}
}

for(var i=0;i<GridResolutionx+Gridbuffer;i++){
	for (var k=0; k < GridResolutionz+Gridbuffer;k++){

		Temperaturet1[i][0][k]=Temperaturet1[i][2][k];
		Temperaturet1[i][GridResolutiony+Gridbuffer-1][k]=Temperaturet1[i][GridResolutiony+Gridbuffer-3][k];
		WindVelocity[i][0][k][0]=WindVelocity[i][2][k][0];
		WindVelocity[i][GridResolutiony+Gridbuffer-1][k][0]=WindVelocity[i][GridResolutiony+Gridbuffer-3][k][0];
		WindVelocity[i][0][k][1]=WindVelocity[i][2][k][1];
		WindVelocity[i][GridResolutiony+Gridbuffer-1][k][1]=WindVelocity[i][GridResolutiony+Gridbuffer-3][k][1];
		WindVelocity[i][0][k][2]=WindVelocity[i][2][k][2];
		WindVelocity[i][GridResolutiony+Gridbuffer-1][k][2]=WindVelocity[i][GridResolutiony+Gridbuffer-3][k][2];

	}
}



}

function DisplayTemp(TempToDisplay) {

    var o = document.getElementById("randomBlock");
    if (o) {
        o.parentNode.removeChild(o);
    }

    var rows = GridResolutionx + Gridbuffer; //Grid Buffer on each side of the display
    var cols = GridResolutiony + Gridbuffer;
    var sizeX   = 30;
    var sizeY  = Math.floor(sizeX*Maxy/Maxx);
    var smooth = 1;
    var smoothKeep = 0.5;
    var smoothTake = (1-smoothKeep)/8;
    var TempColor;

    var container = document.createElement("div");
    container.id = "randomBlock";
    container.className = "container";
    container.style.width = (cols * sizeX) + "px";
    container.style.height = (rows * sizeY) + "px";

    for (var i = 0; i < rows; i++) {
    	for (var j=0; j<cols; j++){
        	o = document.createElement("div");
        	o.className = "cell";
        	o.style.float ="left";
        	o.style.height = sizeY + "px";
        	o.style.width = sizeX + "px";
        	if (smooth ==1 && i > 0 && i < rows -1 && j > 0 && j < cols -1)
        	{
        		TempColor = smoothKeep* TempToDisplay[i][j] + smoothTake* TempToDisplay[i-1][j-1] + smoothTake* TempToDisplay[i-1][j] + smoothTake* TempToDisplay[i-1][j+1] + smoothTake* TempToDisplay[i][j-1] + smoothTake* TempToDisplay[i][j+1] + smoothTake* TempToDisplay[i+1][j-1] + smoothTake* TempToDisplay[i+1][j] + smoothTake* TempToDisplay[i+1][j+1] ;
        		o.style.backgroundColor = getTemperatureColor(TempColor);
        	}
        	else{
        		o.style.backgroundColor = getTemperatureColor(TempToDisplay[i][j]);
        	}
        	// o.style.backgroundColor = getTemperatureColor(i*cols+j); // For testing the color display
        	container.appendChild(o);
    	}
    }
    document.body.appendChild(container);
}

function getTemperatureColor(TemperatureToColor) {
	var MaxTempColor = 35;
	var MinTempColor = 0 ;
    var R1   = 0;
    var B1  = 0;
    var G1 = 0;
    var SHSV  =0.9;  // between 0 and 1
    var VColor=0.9;  // between 0 and 1
    var CColor= SHSV* VColor;
    var CCColor = TemperatureToColor;
    if (TemperatureToColor > MaxTempColor){
    	CCColor = MaxTempColor;
    }
    else if(TemperatureToColor < MinTempColor) {
    	CCColor = MinTempColor;
	}

    var Hue   = (1-(CCColor-MinTempColor)/(MaxTempColor - MinTempColor))*300;
    var HuePrime = Hue/60;
    var XColor = CColor * (1- Math.abs(HuePrime%2 - 1));

    if ( 0 <= HuePrime && HuePrime < 1)
    {
    	R1 = CColor;
    	G1 = XColor;
    	B1 = 0;
    }
    else if ( 1 <= HuePrime && HuePrime < 2)
    {
    	R1 = XColor;
    	G1 = CColor;
    	B1 = 0;
    }
    else if ( 2 <= HuePrime && HuePrime < 3)
    {
    	R1 = 0;
    	G1 = CColor;
    	B1 = XColor;
    }
    else if ( 3 <= HuePrime && HuePrime < 4)
    {
    	R1 = 0;
    	G1 = XColor;
    	B1 = CColor;
    }
    else if ( 4 <= HuePrime && HuePrime < 5)
    {
    	R1 = XColor;
    	G1 = 0;
    	B1 = CColor;
    }
    else if ( 5 <= HuePrime && HuePrime < 6)
    {
    	R1 = CColor;
    	G1 = 0;
    	B1 = XColor;
    }

    var red   = Math.floor(256*(R1 + VColor- CColor));
    var green = Math.floor(256*(G1 + VColor- CColor));
    var blue  = Math.floor(256*(B1 + VColor- CColor));

    return("rgb(" + red + "," + green + "," + blue + ")");
}

function TempSimulateClimate(){

	var WindxOutput = new Array((GridResolutionx+Gridbuffer)*(GridResolutiony+Gridbuffer));
	var WindyOutput = new Array((GridResolutionx+Gridbuffer)*(GridResolutiony+Gridbuffer));
	var TemperatureOutput = new Array((GridResolutionx+Gridbuffer)*(GridResolutiony+Gridbuffer));
	var PressureOutput = new Array((GridResolutionx+Gridbuffer)*(GridResolutiony+Gridbuffer));
  var MonthToSimulate, HourToSimulate, SourceWaterTemperature, Altitude, GallonsPerMinute, PrmiaryWaterVolume, SecondaryWaterVolume, HillsHeight, NetworkArea;
	SimulateClimate(WindxOutput, WindyOutput, TemperatureOutput, PressureOutput, MonthToSimulate, HourToSimulate, SourceWaterTemperature, Altitude, GallonsPerMinute, PrmiaryWaterVolume, SecondaryWaterVolume, HillsHeight, NetworkArea);

}

function SimulateClimate(WindxOutput, WindyOutput, TemperatureOutput, PressureOutput, MonthToSimulate, HourToSimulate, SourceWaterTemperature, Altitude, GallonsPerMinute, PrmiaryWaterVolume, SecondaryWaterVolume, HillsHeight, NetworkArea){

console.log("gallonsPerminute");
console.log(GallonsPerMinute);
//
// Create all of the needed arrays.
//
//
//   var InitialTemperature = new Array(GridResolutionx+Gridbuffer);

  //  for(var k=0; k<HeatSinkNetNumX* HeatSinkNetNumY;k++){
  //    if (k<32)
  //    {
   //
  //      var i =k%HeatSinkNetNumX;
  //      var j= (k-i)/HeatSinkNetNumX;
  //  	   HeatSinkX[k]= Gridbuffer/2+2 + Math.floor(GridResolutionx/HeatSinkNetNumX)*i;
  //      HeatSinkY[k]= Gridbuffer/2+2 + Math.floor(GridResolutiony/HeatSinkNetNumY)*j;
  //      if (i%2 ==1)
  //      {
  //        //HeatSinkX[k]=HeatSinkX[k] +2;
  //       HeatSinkY[k]=HeatSinkY[k] +3;
  //     }
  //
   //
  //         //  HeatSinkX[k]= k+1;
  //       //    HeatSinkY[k]= 10;
   //
  //   }
  //   else {
   //
  //     HeatSinkX[k]= k-20;
  //     HeatSinkY[k]= k-20;
   //
  //   }
   //
  //  	//console.log(HeatSinkX[k]);
  //   //console.log(HeatSinkY[k]);
  //  }
/*
   for(var i=0; i<HeatSinkNetNumY;i++){
    // if(i%2 ==0)
     {
   	   HeatSinkY[i]= Gridbuffer/2+ 2 + Math.floor(GridResolutiony/HeatSinkNetNumY)*i;
     }
     //else {
      // HeatSinkY[i]= Gridbuffer/2+ 4 + Math.floor(GridResolutiony/HeatSinkNetNumY)*i;
     //}
   	//console.log(HeatSinkY[i]);
  }*/

  setUpHeatSinks();
  var monthlySolarIrradiance = new Array (12); // Average Per m^2 hour
  monthlySolarIrradiance[1]  = 3663.5/3600;    // to make it per second
	monthlySolarIrradiance[2]  = 4586.1/3600;
	monthlySolarIrradiance[3]  = 5643.7/3600;
	monthlySolarIrradiance[4]  = 5969.5/3600;
	monthlySolarIrradiance[5]  = 6257.9/3600;
	monthlySolarIrradiance[6]  = 6583.1/3600;
	monthlySolarIrradiance[7]  = 6253/3600  ;
	monthlySolarIrradiance[8]  = 5984.8/3600;
	monthlySolarIrradiance[9]  = 5846.7/3600;
	monthlySolarIrradiance[10] = 5218.7/3600;
	monthlySolarIrradiance[11] = 4142.6/3600;
	monthlySolarIrradiance[12] = 3716/3600  ;

	var longestDayExtralength = 2 * 3600; // The longest day in Dubai is around 14 hours, so 2 hours extra
   	var monthlySunrise = new Array(12);
   	var monthlySunset   = new Array(12);

	for(var i=0; i<12;i++){
		monthlySunrise[i] = (6*3600 + 0.5*longestDayExtralength*Math.cos(Math.PI*(i+1)/6));
		monthlySunset[i]  = (18*3600 -0.5*longestDayExtralength*Math.cos(Math.PI*(i+1)/6));
	}

	var ChosenMonth = 7;
	var ChosenHour = 11; // Needs to be in 24 hour format
	var ChosenHourInSecs = ChosenHour * 3600; // Everything we do is in seconds
	var TempSolarIrraniance =0;
	var TimeSinceSunrise = 0;


   var Temperaturet = new Array(GridResolutionx+Gridbuffer);
   var Temperaturet1 = new Array(GridResolutionx+Gridbuffer);
   var TemperatureToDisplay = new Array(GridResolutionx+Gridbuffer);
   var WindVelocity = new Array(GridResolutionx+Gridbuffer);
 //  var TemperatureOut = new Array (NumOfSamplesToCollect);
 //  var WindOut = new Array(NumOfSamplesToCollect);

for (var i = 0; i < GridResolutionx+Gridbuffer; i++) {
//  InitialTemperature[i] = new Array(GridResolutiony+Gridbuffer);
  Temperaturet[i] = new Array(GridResolutiony+Gridbuffer);
  TemperatureToDisplay[i] = new Array(GridResolutiony+Gridbuffer);
  Temperaturet1[i] = new Array(GridResolutiony+Gridbuffer);
  WindVelocity[i] = new Array(GridResolutiony+Gridbuffer);
  for (var j=0; j<GridResolutiony+Gridbuffer;j++){
 // 	InitialTemperature[i][j]=new Array(GridResolutionz+Gridbuffer);
  	Temperaturet[i][j]=new Array(GridResolutionz+Gridbuffer);
  	Temperaturet1[i][j]=new Array(GridResolutionz+Gridbuffer);
  	WindVelocity[i][j]=new Array(GridResolutionz+Gridbuffer);
  	for (var k=0; k<GridResolutionz+Gridbuffer;k++){
  		WindVelocity[i][j][k]=new Array(3);
  	}
  }
}
/*
for(var t=0; t<NumOfSamplesToCollect; t++)
{

   TemperatureOut[t]= new Array(GridResolutionx+Gridbuffer);
   WindOut[t] = new Array(GridResolutionx+Gridbuffer);

	for (var i = 0; i < GridResolutionx+Gridbuffer; i++)
	{
  		TemperatureOut[t][i] = new Array(GridResolutiony+Gridbuffer);
  		WindOut[t][i] = new Array(GridResolutiony+Gridbuffer);
  		for (var j=0; j<GridResolutiony+Gridbuffer;j++)
  		{
  			TemperatureOut[t][i][j]=new Array(GridResolutionz+Gridbuffer);
  			WindOut[t][i][j]=new Array(GridResolutionz+Gridbuffer);
  			for (var k=0; k<GridResolutionz+Gridbuffer;k++)
  			{
  				WindOut[t][i][j][k]=new Array(3);
  			}
  		}
	}

} */


// Initial temperatures --- NEEDS TO BE CHANGED TO SOMETHING MORE APPROPRIATE

for (var i = 0; i < GridResolutionx+Gridbuffer; i++) {
	for (var j = 0; j < GridResolutiony+Gridbuffer; j++) {
		for (var k=0; k< GridResolutionz+Gridbuffer;k++){

 // 			InitialTemperature[i][j][k] = 30;
  			Temperaturet[i][j][k] = 30;
  			Temperaturet1[i][j][k] = 30;
		}
	}
}

// Start Simulation

var integrationConst = 12 * 3600* (Math.PI/(monthlySunset[ChosenMonth] - monthlySunrise[ChosenMonth])); // This is the const to normalize correctly. The total should be 24*3600* monthlySolarIrradiance. The integration of the sin() function will give 2* (monthlySunset[ChosenMonth] - monthlySunrise[ChosenMonth])/PI . Note that the time difference needs to be in seconds -so it has the 3600 factor-

for(t=0;t<NumOfSamplesToCollect ;t++){

	for(eps=0;eps<NumOfTimeStepsperSample; eps++){

		TimeSinceSunrise = ChosenHourInSecs + t*NumOfTimeStepsperSample*TimeStep + eps*TimeStep - monthlySunrise[ChosenMonth];

		TempSolarIrraniance = integrationConst*monthlySolarIrradiance[ChosenMonth]*Math.sin(Math.PI * (TimeSinceSunrise/(monthlySunset[ChosenMonth] - monthlySunrise[ChosenMonth])));
		TemperatureUpdate(Temperaturet, Temperaturet1, WindVelocity,TempSolarIrraniance);

		for (var i = 0; i < GridResolutionx+Gridbuffer; i++){
			for (var j = 0; j < GridResolutiony+Gridbuffer; j++){
				for (var k = 0; k < GridResolutionz+Gridbuffer; k++){
					var temp_val = Temperaturet1[i][j][k];
  					Temperaturet[i][j][k] =temp_val;
  					//console.log(temp_val);
				}
			}
		}
	}
/*
	for (var i = 0; i < GridResolutionx+Gridbuffer; i++){
		for (var j = 0; j < GridResolutiony+Gridbuffer; j++){
				var temp_val = Temperaturet1[i][j][Gridbuffer/2];
  				//TemperatureOut[t][i][j][k] = temp_val;
  				TemperatureToDisplay[i][j] = temp_val;
  				//TemperatureOutput[i+j*(GridResolutionx+Gridbuffer)] = temp_val;
  				//WindxOutput[i+j*(GridResolutionx+Gridbuffer)] 	   = 100000*WindVelocity[i][j][Gridbuffer/2][0];
  				//WindyOutput[i+j*(GridResolutionx+Gridbuffer)] 	   = 100000*WindVelocity[i][j][Gridbuffer/2][1];
  				//PressureOutput[i+j*(GridResolutionx+Gridbuffer)]   = 45-temp_val;
  				//console.log(TemperatureOut[t][i][j][k]);
  				//WindOut[t][i][j][k][0] = WindVelocity[i][j][k][0];
  				//WindOut[t][i][j][k][1] = WindVelocity[i][j][k][1];
  				//WindOut[t][i][j][k][2] = WindVelocity[i][j][k][2];
		}
	}
*/

for(var i=0;i<FillerBefore;i++){
  TemperatureOutput[i] = FillerContent;
  WindxOutput[i] 	     = FillerContent;
  WindyOutput[i] 	     = FillerContent;
  PressureOutput[i]    = FillerContent;
}

for (var j = 0; j < GridResolutiony+Gridbuffer; j++){
    for (var i = 0; i < GridResolutionx+Gridbuffer; i++){
          var temp_val = Temperaturet1[i][j][Gridbuffer/2];
          TemperatureOutput[FillerBefore+i+j*360] = temp_val +273.15;
          WindxOutput[FillerBefore+i+j*360] 	    = 5000*WindVelocity[i][j][Gridbuffer/2][0] + 1;
          WindyOutput[FillerBefore+i+j*360] 	    = 5000*WindVelocity[i][j][Gridbuffer/2][1] + 1;
          PressureOutput[FillerBefore+i+j*360]    = 50-temp_val + 273.15;
          //console.log(TemperatureOutput[FillerBefore+i+j*360]);
    }
    for (var i = 0; i < FillerBetween; i++){
          TemperatureOutput[FillerBefore+GridResolutionx+Gridbuffer+i+j*360] = FillerContent;
          WindxOutput[FillerBefore+GridResolutionx+Gridbuffer+i+j*360] 	     = FillerContent;
          WindyOutput[FillerBefore+GridResolutionx+Gridbuffer+i+j*360] 	     = FillerContent;
          PressureOutput[FillerBefore+GridResolutionx+Gridbuffer+i+j*360]    = FillerContent;
    }
}

  for(var i=0; i<FillerAfter; i++)
  {
      TemperatureOutput[360*181- FillerAfter + i] = FillerContent;
      WindxOutput[360*181- FillerAfter + i]       = FillerContent;
      WindyOutput[360*181 - FillerAfter + i] 	    = FillerContent;
      PressureOutput[360*181- FillerAfter + i]    = FillerContent;
  }

}
//DisplayTemp(TemperatureToDisplay);

/*
var text_out='\n';

for (var i = 0; i < GridResolutionx+Gridbuffer; i++) {
	for (var j = 0; j < GridResolutiony+Gridbuffer; j++) {
   		text_out=text_out.concat(TemperatureOut[0][i][j][Gridbuffer].toString());
   		text_out=text_out.concat('\t');
	}
 	text_out=text_out.concat('\n');
   	console.log(text_out);
}


document.getElementById("demo").innerHTML=text_out;
*/
}
