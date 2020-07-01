# Quickstart
`npm install`
`npm run test`   // typical test: 2.5mins (10s stabilization + 2.5mins recording), duration varies based on network profile chosen

On completing test run, results found in `./results` folder ordered by test run's timestamp

# To change network profile for testing
- Select your desired network profile from `dash-test-custom/normal-network-patterns.js` (or `fast-network-patterns.js` if your machine is not fast enough)
- Update the network profile value in `dash-test-custom/package.json` > `config.network_profile`

# Note
Test run program `dash-test-custom/run.js` here uses `samples/low-latency-custom/index.html` instead of the standard `low-latency` client provided by TGC
- Reason: customized metrics collection
- Warning: should note changes to low-latency client and propagate to low-latency-custom