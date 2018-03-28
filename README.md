# core-qix-session-workout

Generic load test tool for Qlik Core.

This is an experimental tool and it's APIs is under redesign.

```
Usage: cli.js [options]

Options:
  --help, -h               Show help                                                                                               [boolean]
  --threads, -t            Number of threads to run in parallell/n Setting to `-1` will use the number of cores        [number] [default: 1]
  --gateway, -g            Gateway to connect to                                                             [string] [default: "localhost"]
  --direct, -d             Opens the app directly on the engine                                                   [boolean] [default: false]
  --docpath                Path to document                                                     [string] [default: "/doc/doc/drugcases.qvf"]
  --max, -m                Max number of sessions                                                                                   [number]
  --interval, -i           How often new sessions should be created                                                   [number] [default: 60]
  --selectionInterval, -s  How often selections should be done                                                     [number] [default: 10000]
  --selectionRatio, -r     The amount of sessions the should do selections (in %)                                    [number] [default: 0.1]
  --loginUrl, -l           If a cookie should be fetched and used in ws header
                                                                [string] [default: "/login/local/callback?username=admin&password=password"]
  --cookie                 Fixed cookie to be used in ws header                                                                     [string]
  --keepAlive, -k          Don´t close sessions after ramp up                                                     [boolean] [default: false]
  --objects                Defined objects to create after session create                                              [array] [default: []]
  --secure                 Wheather to use wss or ws                                                               [boolean] [default: true]
  --config, -c             Path to JSON config file                                                                 [string] [default: null]
  ```

Configurations can be specified in a config file and be used as only parameter to the `cli.js`
```
./cli.js -c ./configs/local.js
```