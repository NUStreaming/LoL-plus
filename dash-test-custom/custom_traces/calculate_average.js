const traces = require("./output/custom-network-patterns.js")

function calculateAverage(tracesArray) {
  var total = 0;
  for (var i = 0; i < tracesArray.length; i++) {
    total += tracesArray[i].speed;
  }
  return (total / tracesArray.length);
}
var toProcess = [
  "PROFILE_BelgiumLTE_bicycle", 
  "PROFILE_BelgiumLTE_train",
  "PROFILE_BelgiumLTE_train_modified",
  "PROFILE_BelgiumLTE_tram",
  "PROFILE_Twitch_Channel_Low2", 
  "PROFILE_Twitch_Channel_Med2"
]

for (var i = 0; i < toProcess.length; i++) {
  console.log("Processing: " + toProcess[i]);
  console.log(".. average speed = " + calculateAverage(traces[toProcess[i]]));
  console.log("")
}
