/*
 * Authors:
 * May Lim | National University of Singapore | maylim17@u.nus.edu
 * Mehmet N. Akcay | Ozyegin University | necmettin.akcay@ozu.edu.tr
 * Abdelhak Bentaleb | National University of Singapore | bentaleb@comp.nus.edu.sg
 */
var TgcLearningRule;

function TgcLearningRuleClass() {

    let factory = dashjs.FactoryMaker;
    let SwitchRequest = factory.getClassFactoryByName('SwitchRequest');
    let MetricsModel = factory.getSingletonFactoryByName('MetricsModel');
    let DashMetrics = factory.getSingletonFactoryByName('DashMetrics');
    let StreamController = factory.getSingletonFactoryByName('StreamController');
    let PlaybackController = factory.getSingletonFactoryByName('PlaybackController');
    let MediaPlayerModel = factory.getSingletonFactoryByName('MediaPlayerModel');
    let context = this.context;
    let instance;

    let metricsConstants = {
        ABANDON_LOAD: 'abandonload',
        BUFFER_STATE: 'BufferState'
    }

    const learningController = new LearningAbrController();
    let qoeEvaluator = new QoeEvaluator();

    function setup() {
    }

    function getMaxIndex(rulesContext) {
        let switchRequest = SwitchRequest(context).create();

        let metricsModel = MetricsModel(context).getInstance();
        let dashMetrics = DashMetrics(context).getInstance();
        let mediaType = rulesContext.getMediaInfo().type;
        let metrics = metricsModel.getMetricsFor(mediaType, true);
        let mediaPlayerModel = MediaPlayerModel(context).getInstance();

        // Dash controllers
        let streamController = StreamController(context).getInstance();
        let playbackController = PlaybackController(context).getInstance();
        let abrController = rulesContext.getAbrController();

        // Additional stuff for Learning rule
        let current = abrController.getQualityFor(mediaType, streamController.getActiveStreamInfo());

        // Additional stuff for both
        const mediaInfo = rulesContext.getMediaInfo();
        const bufferStateVO = dashMetrics.getLatestBufferInfoVO(mediaType, true, metricsConstants.BUFFER_STATE);
        const scheduleController = rulesContext.getScheduleController();
        const currentBufferLevel = dashMetrics.getCurrentBufferLevel(mediaType, true);
        const streamInfo = rulesContext.getStreamInfo();
        const isDynamic = streamInfo && streamInfo.manifestInfo ? streamInfo.manifestInfo.isDynamic : null;

        let latency = playbackController.getCurrentLiveLatency();
        if (!latency) latency=0;
        const playbackRate = playbackController.getPlaybackRate();
        
        /*
         * Throughput
         */
        const throughputHistory = abrController.getThroughputHistory();
        // const throughput = throughputHistory.getAverageThroughput(mediaType, isDynamic);
        const throughput = throughputHistory.getSafeAverageThroughput(mediaType, isDynamic);
        console.log('[TgcLearningRule] throughput: ' + Math.round(throughput) + 'kbps');

        if (isNaN(throughput) || !bufferStateVO) {
            return switchRequest;
        }

        if (abrController.getAbandonmentStateFor(mediaType) === metricsConstants.ABANDON_LOAD) {
            return switchRequest;
        }

        // QoE parameters
        let bitrateList = mediaInfo.bitrateList;  // [{bandwidth: 200000, width: 640, height: 360}, ...]
        let segmentDuration = rulesContext.getRepresentationInfo().fragmentDuration;
        let minBitrateKbps = bitrateList[0].bandwidth / 1000.0;                         // min bitrate level
        let maxBitrateKbps = bitrateList[bitrateList.length - 1].bandwidth / 1000.0;    // max bitrate level
        for (let i = 0; i < bitrateList.length; i++) {  // in case bitrateList is not sorted as expeected
            let b = bitrateList[i].bandwidth / 1000.0;
            if (b > maxBitrateKbps) maxBitrateKbps = b;
            else if (b < minBitrateKbps) minBitrateKbps = b;
        }

        // Learning rule pre-calculations
        let currentBitrate = bitrateList[current].bandwidth;
        let currentBitrateKbps = currentBitrate / 1000.0;
        let httpRequest = dashMetrics.getCurrentHttpRequest(mediaType, true);
        let lastFragmentDownloadTime = (httpRequest.tresponse.getTime() - httpRequest.trequest.getTime())/1000;
        let segmentRebufferTime = lastFragmentDownloadTime>segmentDuration?lastFragmentDownloadTime-segmentDuration:0;
        qoeEvaluator.setupPerSegmentQoe(segmentDuration, maxBitrateKbps, minBitrateKbps);
        qoeEvaluator.logSegmentMetrics(currentBitrateKbps, segmentRebufferTime, latency, playbackRate);
        let currentQoeInfo = qoeEvaluator.getPerSegmentQoe();
        let currentTotalQoe = currentQoeInfo.totalQoe;
        console.log("QoE: ",currentTotalQoe);


        /*
        * Dynamic Weights Selector (step 1/2: initialization)
        */
        // let userTargetLatency = mediaPlayerModel.getLiveDelay();    // not ideal to use this value as it is used for playback controller and too conservative for this.. 
        // Todo: To consider specifying param values via UI
        let dwsTargetLatency = 1.5;
        let dwsBufferMin = 0.3;                             // for safe buffer constraint
        let dwsBufferMax = dwsBufferMin + segmentDuration;  // for safe buffer constraint (may not be in use)
        let dynamicWeightsSelector = new DynamicWeightsSelector(dwsTargetLatency, dwsBufferMin, dwsBufferMax, segmentDuration, qoeEvaluator);
        // console.log('--- dynamicWeightsSelector (initialization) ---');
        // console.log('-- dwsTargetLatency: ', dwsTargetLatency);
        // console.log('-- dwsBufferMin: ', dwsBufferMin);
        // console.log('-- dwsBufferMax: ', dwsBufferMax);
        // console.log('-- segmentDuration: ', segmentDuration);
        // console.log('-- returns dynamicWeightsSelector:');
        // console.log(dynamicWeightsSelector);

        /*
         * Select next quality
         */
        switchRequest.quality = learningController.getNextQuality(mediaInfo,throughput*1000,latency,currentBufferLevel,playbackRate,current, currentTotalQoe, dynamicWeightsSelector);
        switchRequest.reason = { throughput: throughput, latency: latency};
        switchRequest.priority = SwitchRequest.PRIORITY.STRONG;

        scheduleController.setTimeToLoadDelay(0);

        if (switchRequest.quality!=current){
            console.log('[TgcLearningRule][' + mediaType + '] requesting switch to index: ', switchRequest.quality, 'Average throughput', Math.round(throughput), 'kbps');
        }

        return switchRequest;
    }


    instance = {
        getMaxIndex: getMaxIndex
    };

    setup();

    return instance;
}

/* *******************************
*    Main abr logic
* ******************************* */
class LearningAbrController {

    constructor() {
        this.somBitrateNeurons=null;
        this.bitrateNormalizationFactor=1;
        this.latencyNormalizationFactor=100;
        this.minBitrate=0;
        this.weights=null;
        this.sortedCenters=null;
    }

    getSomBitrateNeurons(mediaInfo){
        if (!this.somBitrateNeurons){
            this.somBitrateNeurons = [];
            const bitrateList = mediaInfo.bitrateList;
            let bitrateVector=[];
            this.minBitrate=bitrateList[0].bandwidth;
            bitrateList.forEach(element => {
                bitrateVector.push(element.bandwidth);   
                if (element.bandwidth<this.minBitrate){
                    this.minBitrate=element.bandwidth;
                }
            });
            this.bitrateNormalizationFactor=this.getMagnitude(bitrateVector);
            console.log("throughput normalization factor is "+this.bitrateNormalizationFactor);
            
            for (let i = 0; i < bitrateList.length; i++) {
                let neuron={
                    qualityIndex: i,
                    bitrate: bitrateList[i].bandwidth,
                    state: {
                        // normalize throughputs
                        throughput: bitrateList[i].bandwidth/this.bitrateNormalizationFactor,
                        latency: 0,
                        buffer: 1,
                        playbackRate: 1,
                        QoE: 1
                    }
                }
                this.somBitrateNeurons.push(neuron);
            }

            this.sortedCenters=this.getInitialKmeansPlusPlusCenters(this.somBitrateNeurons);
        }
        return this.somBitrateNeurons;
    }

    getMaxThroughput(){
        let maxThroughput=0;
        if (this.somBitrateNeurons){
            for(let i=0;i<this.somBitrateNeurons.length;i++){
                let n=this.somBitrateNeurons[i];
                if (n.state.throughput>maxThroughput){
                    maxThroughput=n.state.throughput;
                }
            }
        } 
        return maxThroughput;
    }

    getMagnitude(w){
        return w
            .map((x) => (x**2)) // square each element
            .reduce((sum, now) => sum + now) // sum 
            ** (1/2) // square root
    }

    getDistance(a, b, w) {
        let sum=a
            .map((x, i) => (w[i] * (x-b[i]) ** 2)) // square the difference*w
            .reduce((sum, now) => sum + now) // sum
        let sign=(sum<0)?-1:1;
        return sign*Math.abs(sum) ** (1/2)
    }

    getNeuronDistance(a, b) {
        let aState=[a.state.throughput,a.state.latency, a.state.buffer, a.state.playbackRate, a.state.QoE];
        let bState=[b.state.throughput,b.state.latency, b.state.buffer, b.state.playbackRate, b.state.QoE];
        return this.getDistance(aState,bState,[1,1,1,1,1]);
    }

    updateNeurons(winnerNeuron,somElements,x){
        // update all neurons
        for (let i =0; i< somElements.length ; i++) {
            let somNeuron=somElements[i];
            let sigma=0.1;
            let neighbourHood=Math.exp(-1*this.getNeuronDistance(somNeuron,winnerNeuron)**2/(2*sigma**2));
            this.updateNeuronState(somNeuron,x, neighbourHood);
        }
    }

    updateNeuronState(neuron, x, neighbourHood){
        let state=neuron.state;
        let w=[0.01, 0.01, 0.01, 0.01, 0.01]; // learning rate
        // console.log("before update: neuron=",neuron.qualityIndex," throughput=",state.throughput," latency=",state.latency," buffer=",state.buffer)
        state.throughput=state.throughput+(x[0]-state.throughput)*w[0]*neighbourHood;
        state.latency=state.latency+(x[1]-state.latency)*w[1]*neighbourHood;
        state.buffer=state.buffer+(x[2]-state.buffer)*w[2]*neighbourHood;
        state.playbackRate=state.playbackRate+(x[3]-state.playbackRate)*w[3]*neighbourHood;
        state.QoE=state.QoE+(x[4]-state.QoE)*w[4]*neighbourHood;
        console.log("after update: neuron=",neuron.qualityIndex,"throughput=",state.throughput,
                    "latency=",state.latency," buffer=",state.buffer,
                    "playbackRate=",state.playbackRate, "QoE=",state.QoE);
    }

    getNextQuality(mediaInfo, throughput, latency, bufferSize, playbackRate, currentQualityIndex, QoE, dynamicWeightsSelector){
        // For Dynamic Weights Selector
        let currentLatency = latency;
        let currentBuffer = bufferSize;
        let currentThroughput = throughput;
        
        let somElements=this.getSomBitrateNeurons(mediaInfo);
        // normalize throughput
        let throughputNormalized=throughput/this.bitrateNormalizationFactor;
        // saturate values higher than 1
        if (throughputNormalized>1) throughputNormalized=this.getMaxThroughput();
        // normalize latency
        latency=latency/this.latencyNormalizationFactor;
        // normalize QoE
        let QoENormalized =  (QoE<this.bitrateNormalizationFactor) ? QoE / this.bitrateNormalizationFactor : 1;

        const targetLatency=0;
        const targetBufferLevel=1;
        const targetQoe=1;
        const targetPlaybackRate=1;
        // 10K + video encoding is the recommended throughput
        const throughputDelta=10000;
        const minAllowedQoE=50;
        
        console.log("getNextQuality called throughput="+throughputNormalized+" latency="+latency+" bufferSize="+bufferSize," currentQualityIndex=",currentQualityIndex," playbackRate=",playbackRate," QoE=",QoE);

        let currentNeuron=somElements[currentQualityIndex];
        // update current neuron and the neighbourhood with the calculated QoE
        // will punish current if it is not picked
        this.updateNeurons(currentNeuron,somElements,[throughputNormalized,latency,bufferSize,playbackRate,QoENormalized]);

        // create 5 weights
        // let weights=this.getXavierWeights(somElements.length,5);
        // kmeans++ weights
        if (!this.weights){
            // initial weights
            this.weights=this.sortedCenters[this.sortedCenters.length-1];
        }
        
        /*
        * Dynamic Weights Selector (step 2/2: find weights)
        */
        let neurons = somElements;
        let weightVector = dynamicWeightsSelector.findWeightVector(neurons, currentLatency, currentBuffer, currentThroughput, playbackRate);
        //let weightVector = dynamicWeightsSelector.findWeightVectorByDistance(neurons, [throughputNormalized,targetLatency,targetBufferLevel,targetPlaybackRate, targetQoe]);
        if (weightVector != null && weightVector != -1) {   // null: something went wrong, -1: constraints not met
            // update weights
            this.weights = weightVector;
        }
        // For debugging
        console.log('--- dynamicWeightsSelector (find weights) ---');
        console.log('-- currentLatency: ', currentLatency);
        console.log('-- currentBuffer: ', currentBuffer);
        console.log('-- returns weightVector: ');
        console.log(weightVector);

        /**
         * hardcoded weights
         */
        /*
        // calculate weights
        let throughputWeight=0.4;
        let latencyWeight=0.4;
        let bufferWeight=0.4;
        let playbackRateWeight=0.4;
        // QoE is very important if it is decreasing increase the weight!
        // let QoEWeight = ( QoE < minAllowedQoE ) ? 1 : 0.4;
        this.weights=[ throughputWeight, latencyWeight, bufferWeight, playbackRateWeight, QoEWeight ]; // throughput, latency, buffer, playbackRate, QoE
        */

        // disable QoE
        this.weights[4]=0;

        let minDistance=null;
        let minIndex=null;
        let winnerNeuron=null;
        for (let i =0; i< somElements.length ; i++) {
            let somNeuron=somElements[i];
            let somNeuronState=somNeuron.state;
            let somData=[somNeuronState.throughput,
                somNeuronState.latency,
                somNeuronState.buffer,
                somNeuronState.playbackRate,
                somNeuronState.QoE];

            // special condition downshift immediately
            if (somNeuron.bitrate>throughput-throughputDelta){
                if (somNeuron.bitrate!=this.minBitrate){
                    // encourage to pick smaller bitrates throughputWeight=100
                    this.weights[0]=100;
                }
            }

            // calculate the distance with the target
            let distance=this.getDistance(somData,[throughputNormalized,targetLatency,targetBufferLevel,targetPlaybackRate, targetQoe],this.weights);
            if (minDistance==null || distance<minDistance){
                minDistance=distance;
                minIndex=somNeuron.qualityIndex;
                winnerNeuron=somNeuron;
            }
            console.log("distance=",distance);
        }

        // update bmu and neighnours with targetQoE=1, targetLatency=0
        this.updateNeurons(winnerNeuron,somElements,[throughputNormalized,targetLatency,targetBufferLevel,targetPlaybackRate, targetQoe]);

        return minIndex;
    }

    getXavierWeights(neuronCount,weightCount){
        if (!this.weights){
            let W=[];
            let upperBound=(2/neuronCount)**1/2;
            for(let i=0;i<weightCount;i++){
                W.push(Math.random() * upperBound);
            }
            console.log("Xavier Weights=",W);
            this.weights=W;
        }
        return this.weights;    
    }

    getRandomData(size){
        let dataArray=[];
        for (let i=0;i<size;i++){
            let data=[
                Math.random()*this.getMaxThroughput(), //throughput
                Math.random(), //latency
                Math.random(), //buffersize
                1, //playbackrate,
                Math.random(), //QoE
            ];
            dataArray.push(data);
        }
        return dataArray;
    }

    getInitialKmeansPlusPlusCenters(somElements){
        let centers=[];
        let randomDataSet=this.getRandomData(somElements.length**2);
        centers.push(randomDataSet[0]);
        let distanceWeights=[1,1,1,1,1];
        for(let k=1;k<somElements.length;k++){
            let nextPoint=null;
            let maxDistance=null;
            for (let i=0;i<randomDataSet.length;i++){
                let currentPoint=randomDataSet[i];
                let minDistance=null;
                for (let j=0;j<centers.length;j++){
                    let distance=this.getDistance(currentPoint,centers[j],distanceWeights);
                    if (minDistance==null || distance<minDistance){
                        minDistance=distance;
                    }
                }
                if (maxDistance==null || minDistance>maxDistance){
                    nextPoint=currentPoint;
                }
            }
            centers.push(nextPoint);
        }
        // console.log("Centers=",centers);
        // find the least similar center
        let maxDistance=null;
        let leastSimilarIndex=null;
        for(let i=0;i<centers.length;i++){
            let distance=0;
            for(let j=0;j<centers.length;j++){
                if (i==j) continue;
                distance+=this.getDistance(centers[i],centers[j],distanceWeights);
            }
            if (maxDistance==null || distance>maxDistance){
                maxDistance=distance;
                leastSimilarIndex=i;
            }
        }

        // move centers to sortedCenters
        let sortedCenters=[];
        sortedCenters.push(centers[leastSimilarIndex]);
        centers.splice(leastSimilarIndex,1);
        while(centers.length>0){
            let minDistance=null;
            let minIndex=null;
            for(let i=0;i<centers.length;i++){
                let distance=this.getDistance(sortedCenters[0],centers[i],distanceWeights);
                if (minDistance==null || distance<minDistance){
                    minDistance=distance;
                    minIndex=i;
                }
            }
            sortedCenters.push(centers[minIndex]);
            centers.splice(minIndex,1);
        }

        console.log("sortedCenters=",sortedCenters);
        return sortedCenters;
    }
}

TgcLearningRuleClass.__dashjs_factory_name = 'TgcLearningRule';
TgcLearningRule = dashjs.FactoryMaker.getClassFactory(TgcLearningRuleClass);