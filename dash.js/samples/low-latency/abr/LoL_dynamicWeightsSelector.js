class DynamicWeightsSelector {
    // Note in learningRule: weights = [
    //                         throughput,
    //                         latency,
    //                         buffer,
    //                         playbackRate,
    //                         QoE
    //                     ]
    // And in pdf: { wt-tput, wt-latency, wt-rebuf, wt-speed, wt-switch }

    //
    // First, ABR to create weightsSelector object 
    // at the start of streaming session
    //
    constructor(targetLatency, bufferMin, bufferMax, segmentDuration, qoeEvaluator) {

        // For later use in checking constraints
        this.targetLatency = targetLatency;
        this.bufferMin = bufferMin;
        this.bufferMax = bufferMax;
        this.segmentDuration = segmentDuration;
        this.qoeEvaluator = qoeEvaluator;

        // Generate all possible weight vectors
        let valueList = [0, 0.2, 0.4, 0.6, 0.8, 1];
        let weightTypeCount = 5;
        this.weightOptions = this.getPermutations(valueList, weightTypeCount);

        console.log(this.weightOptions.length); // e.g. 7776
    }


    // !! Only possible/required for Method II (see below) !! //
    // (Note: Include somData in neurons
    // so that we do not depend on the specific keys 
    // being used in the state, such as tput/latency/etc.)
    // i.e., neurons = [
    //     {
    //         bitrate: 200000,         // already present
    //         somData: [               // not yet present
    //             state.throughput, 
    //             state.latency, 
    //             state.buffer, 
    //             state.playbackRate, 
    //             state.QoE
    //         ],
    //         ...
    //     },
    //     { ... },
    //     { ... }
    // ]

    //
    // Next, at each segment boundary, 
    // ABR to input current neurons and target state (only used in Method II)
    // to find the desired weight vector
    //
    findWeightVector(neurons, targetState, currentLatency, currentBuffer, currentThroughput) {

        // let minDistance = null; // the lower the better
        let maxQoE = null;      // the higher the better
        let winnerWeights = null;
        let winnerBitrate = null;

        // For each neuron, m
        neurons.forEach((neuron) => {

            // For each possible weight vector, z
            // E.g. For [ throughput, latency, buffer, playbackRate, QoE ]
            //      Possible weightVector = [ 0.2, 0.4, 0.2, 0, 0.2 ]
            this.weightOptions.forEach((weightVector) => {

                /*
                 * Constraint C5: Sum of weights equals 1
                 * i.e. Skip this weightVector if sum is more than 1
                 */
                // (Omit C5 for now)
                // let weightsTotal = 0;
                // weightVector.forEach((w) => {
                //     weightsTotal += w
                //     if (weightsTotal > 1) {
                //         continue;
                //     }
                // })

                // For debugging
                // console.log('--- neuron ---')
                // console.log(neuron);
                // console.log('--- weightVector ---')
                // console.log(weightVector);

                // Apply weightVector to neuron, compute utility and determine winnerWeights

                /*
                 * Method I: Utility based on QoE given current state
                 */
                let weightsObj = {
                    throughput: weightVector[0],
                    latency: weightVector[1],
                    buffer: weightVector[2],
                    playbackRate: weightVector[3],
                    QoE: weightVector[4]
                };

                /*
                 * Method I(A): QoE-based Learning Rule
                 */
                // (Seems trivial since the winnerWeight will be the one with the highest value)
                // (Note in learning rule, it's weight * sq-diff btwn neuronState & targetState)
                let weightedQoE = weightsObj.QoE * neuron.state.QoE;
                if (maxQoE == null || weightedQoE > maxQoE){
                    maxQoE = weightedQoE;
                    winnerWeights = weightVector;
                    winnerBitrate = neuron.bitrate;
                }

                /*
                 * Method I(B): Non-QoE-based Learning Rule
                 */
                // let downloadTime = (neuron.bitrate * this.segmentDuration) / currentThroughput;
                // let rebuffer = Math.max(0, (downloadTime - currentBuffer));
                // // let weightedRebuffer = weightsObj.buffer * rebufferTime; // TODO: verify if it's sound to use buffer wt on rebuffer value
                // let weightedLatency = weightsObj.latency * neuron.state.latency;
                // let weightedPlaybackRate = weightsObj.playbackRate * neuron.state.playbackRate;
                // let totalQoE = this.qoeEvaluator.calculateSingleUseQoe(neuron.bitrate, rebuffer, weightedLatency, weightedPlaybackRate);  // Note currently using rebuffer instead of weightedRebuffer
                // if (maxQoE == null || totalQoE > maxQoE){
                //     maxQoE = totalQoE;
                //     winnerWeights = weightVector;
                //     winnerBitrate = neuron.bitrate;
                // }

                /*
                 * Method II: Utility based on neuron distance to target state
                 * (Avoid using this method since it is being used in the actual learningRule so there is double application)
                 */
                // let distance = this.getDistance(neuron.somData, targetState, weightVector);
                // if (minDistance == null || distance < minDistance){
                //     minDistance = distance;
                //     winnerWeights = weightVector;
                //     winnerBitrate = neuron.bitrate;
                // }
            });
        });

        // winnerWeights was found, check if constraints are satisfied
        if (winnerWeights != null && winnerBitrate !== null) {
            // If constraints are not satisfied, return null 
            // so that ABR can react accordingly
            // e.g. to select lowest bitrate
            // TODO: Sync with ABR
            if (!this.checkConstraints(currentLatency, currentBuffer, currentThroughput, winnerBitrate)) {
                winnerWeights = -1;
            } 
        }

        return winnerWeights;
    }

    checkConstraints(currentLatency, currentBuffer, currentThroughput, winnerBitrate) {
        // For debugging
        console.log('-- currentLatency: ', currentLatency);
        console.log('-- currentBuffer: ', currentBuffer);
        console.log('-- currentThroughput: ', currentThroughput);
        console.log('-- winnerBitrate: ', winnerBitrate);

        // Constraint C1
        if (currentLatency > this.targetLatency) {
            console.log('[DynamicWeightsSelector] Failed constraint C1!');
            return false;
        }

        // Constraint C2
        // if (currentBuffer < this.bufferMin || currentBuffer > this.bufferMax) {
        if (currentBuffer < this.bufferMin) {
            console.log('[DynamicWeightsSelector] Failed constraint C2!');
            return false;
        }

        // Constraint C3
        let downloadTime = (winnerBitrate * this.segmentDuration) / currentThroughput;
        console.log('-- downloadTime: ', downloadTime);
        if (downloadTime > currentBuffer) {
            console.log('[DynamicWeightsSelector] Failed constraint C3!');
            return false;
        }
        
        return true;
    }

    // Taken from heuristicRule
    // TODO: Refactor to common util file?
    getPermutations(list, length) {
        // Copy initial values as arrays
        var perm = list.map(function(val) {
            return [val];
        });
        // Our permutation generator
        var generate = function(perm, length, currLen) {
            // Reached desired length
            if (currLen === length) {
                return perm;
            }
            // For each existing permutation
            for (var i = 0, len = perm.length; i < len; i++) {
                var currPerm = perm.shift();
                // Create new permutation
                for (var k = 0; k < list.length; k++) {
                    perm.push(currPerm.concat(list[k]));
                }
            }
            // Recurse
            return generate(perm, length, currLen + 1);
        };
        // Start with size 1 because of initial values
        return generate(perm, length, 1);
    }

    // Taken from learningRule
    // TODO: Refactor to common util file?
    getDistance(a, b, w) {
        return a
            .map((x, i) => (w[i] * (x-b[i]) ** 2)) // square the difference*w
            .reduce((sum, now) => sum + now) // sum
            ** (1/2) // square root
    }

}

// Additional for run.js invocation of DynamicWeightsSelector
if (typeof exports !== 'undefined') {
    exports.DynamicWeightsSelector = DynamicWeightsSelector;
}