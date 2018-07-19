# core-qix-session-workout

Generic load test tool for Qlik Core.

This is an experimental tool and it's APIs is under redesign.

```code
Usage: main.js [options]

Options:
  --help, -h             Show help                                                                                                 [boolean]
  --threads, -t          Number of threads to run in parallell/n Setting to `-1` will use the number of cores          [number] [default: 1]
  --max, -m              Max number of sessions                                                                                     [number]
  --interval, -i         How often new sessions should be created                                                     [number] [default: 60]
  --interactionInterval  How often interactions should be done                                                     [number] [default: 10000]
  --interactionRatio     The amount of sessions the should do selections (in %)                                      [number] [default: 0.1]
  --keepAlive, -k        Don´t close sessions after ramp up                                                       [boolean] [default: false]
  --config, -c           Path to JSON config file                                                                                   [string]
  --scenario, -s         Path to scenario file                                                                                      [string]
  --sessionLength        The length of each session (in ms)                                                   [number] [default: 1000000000]
  --triangular           If set to true the traffic speed will slowly increase to the maximum rate (the specified interval) and thereafter
                         slowly decrease                                                                          [boolean] [default: false]
  --seed                 The seed that should be used for generating randomness                                                     [string]

  ```

Configurations can be specified in a config file and be used as only parameter to the `cli.js`

```bash
node main.js -c configs/scaling.json -s scenarios/my-scenario.js
```
