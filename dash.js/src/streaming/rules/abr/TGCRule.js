// import FactoryMaker from '../../../core/FactoryMaker';
// import Debug from '../../../core/Debug';
// import SwitchRequest from '../SwitchRequest';
// import Constants from '../../constants/Constants';
// import MetricsConstants from '../../constants/MetricsConstants';

// function TGCRule(config) {

//     config = config || {};
//     const context = this.context;
//     const dashMetrics = config.dashMetrics;
//     const somController=new SOMAbrController();

//     let instance,
//         logger;

//     function setup() {
//         logger = Debug(context).getInstance().getLogger(instance);
//     }

//     function checkConfig() {
//         if (!dashMetrics || !dashMetrics.hasOwnProperty('getLatestBufferInfoVO')) {
//             throw new Error(Constants.MISSING_CONFIG_ERROR);
//         }
//     }

//     function getMaxIndex(rulesContext) {
//         // initial content taken from ThroughputRule
//         const switchRequest = SwitchRequest(context).create();

//         if (!rulesContext || !rulesContext.hasOwnProperty('getMediaInfo') || !rulesContext.hasOwnProperty('getMediaType') || !rulesContext.hasOwnProperty('useBufferOccupancyABR') ||
//             !rulesContext.hasOwnProperty('getAbrController') || !rulesContext.hasOwnProperty('getScheduleController')) {
//             return switchRequest;
//         }

//         checkConfig();

//         const mediaInfo = rulesContext.getMediaInfo();
//         const mediaType = rulesContext.getMediaType();
//         const bufferStateVO = dashMetrics.getLatestBufferInfoVO(mediaType, true, MetricsConstants.BUFFER_STATE);
//         const scheduleController = rulesContext.getScheduleController();
//         const abrController = rulesContext.getAbrController();
//         const streamInfo = rulesContext.getStreamInfo();
//         const isDynamic = streamInfo && streamInfo.manifestInfo ? streamInfo.manifestInfo.isDynamic : null;
//         const throughputHistory = abrController.getThroughputHistory();
//         const throughput = throughputHistory.getSafeAverageThroughput(mediaType, isDynamic);
//         // console.log('[TGCRule] throughput: ' + Math.round(throughput) + 'kbps');
//         const latency = throughputHistory.getAverageLatency(mediaType);
//         //const useBufferOccupancyABR = rulesContext.useBufferOccupancyABR();
//         const useBufferOccupancyABR = false;

//         if (isNaN(throughput) || !bufferStateVO || useBufferOccupancyABR) {
//             return switchRequest;
//         }

//         if (abrController.getAbandonmentStateFor(mediaType) !== MetricsConstants.ABANDON_LOAD) {
//             if (bufferStateVO.state === MetricsConstants.BUFFER_LOADED || isDynamic) {
//                 // switchRequest.quality = abrController.getQualityForBitrate(mediaInfo, throughput, latency);
//                 switchRequest.quality = somController.getQualityUsingSom(mediaInfo,throughput*1000,latency,bufferStateVO.target);
//                 scheduleController.setTimeToLoadDelay(0);
//                 // logger.debug('[' + mediaType + '] requesting switch to index: ', switchRequest.quality, 'Average throughput', Math.round(throughput), 'kbps');
//                 console.log('[' + mediaType + '] requesting switch to index: ', switchRequest.quality, 'Average throughput', Math.round(throughput), 'kbps');
//                 switchRequest.reason = {throughput: throughput, latency: latency};
//             }
//         }

//         return switchRequest;

//         // Ask to switch to the lowest bitrate - for debugging
//         // let switchRequest = SwitchRequest(context).create();
//         // switchRequest.quality = 0;
//         // switchRequest.reason = 'Always switching to the lowest bitrate';
//         // switchRequest.priority = SwitchRequest.PRIORITY.STRONG;
//         // return switchRequest;
//     }

//     function reset() {
//         // no persistent information to reset
//     }

//     instance = {
//         getMaxIndex: getMaxIndex,
//         reset: reset
//     };

//     setup();

//     return instance;
// }

// class SOMAbrController{

//     constructor() {
//         this.somBitrateNeurons=null;
//     }

//     getSomBitrateNeurons(mediaInfo){
//         if (!this.somBitrateNeurons){
//             this.somBitrateNeurons = [];
//             const bitrateList = mediaInfo.bitrateList;
//             for (let i = 0; i < bitrateList.length; i++) {
//                 let neuron={
//                     qualityIndex: i,
//                     bitrate: bitrateList[i].bandwidth,
//                     state: {
//                         throughput: bitrateList[i].bandwidth,
//                         latency: 0,
//                         buffer: 0
//                     }
//                 }
//                 this.somBitrateNeurons.push(neuron);
//             }
//         }
//         return this.somBitrateNeurons;
//     }

//     getDistance(a, b, w) {
//         return a
//             .map((x, i) => (w[i]*(x-b[i])) ** 2) // square the difference*w
//             .reduce((sum, now) => sum + now) // sum
//             ** (1/2) // square root
//     }

//     updateNeuronState(neuron, x){
//         let state=neuron.state;
//         let w=0.1; // learning rate
//         state.throughput=state.throughput+(x[0]-state.throughput)*w
//         state.latency=state.latency+(x[1]-state.latency)*w
//         state.buffer=state.buffer+(x[2]-state.buffer)*w
//     }

//     getQualityUsingSom(mediaInfo, throughput, latency, bufferSize){
//         let somElements=this.getSomBitrateNeurons(mediaInfo);
//         let minDistance=null;
//         let minIndex=null;
//         let neuronTobeUpdated=null;
//         for (let i =0; i< somElements.length ; i++) {
//             let somNeuron=somElements[i];
//             let somNeuronState=somNeuron.state;
//             let somData=[somNeuronState.throughput,somNeuronState.latency,somNeuronState.buffer];
//             let distance=this.getDistance(somData,[throughput,latency,bufferSize],[1,1,1]);
//             if (minDistance==null || distance<minDistance){
//                 minDistance=distance;
//                 minIndex=somNeuron.qualityIndex;
//                 neuronTobeUpdated=somNeuron;
//             }
//             console.log("distance=",distance);
//         }
//         if (neuronTobeUpdated!=null){
//             this.updateNeuronState(neuronTobeUpdated,[throughput,latency,bufferSize]);
//         }
//         return minIndex;
//     }
// }

// TGCRule.__dashjs_factory_name = 'TGCRule';
// export default FactoryMaker.getClassFactory(TGCRule);
