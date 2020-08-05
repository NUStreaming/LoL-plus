import os
import csv
import json

to_process = [
    {
        "input_csv": "input/Belgium-LTE.csv",
        "output_js": "output/custom-network-patterns.js",
        "profile_name": "PROFILE_BelgiumLTE_bicycle",
        "bandwidth_col_id": 0,
        "interval_sec": 1
    },
    {
        "input_csv": "input/Belgium-LTE.csv",
        "output_js": "output/custom-network-patterns.js",
        "profile_name": "PROFILE_BelgiumLTE_bus",
        "bandwidth_col_id": 1,
        "interval_sec": 1
    },
    {
        "input_csv": "input/Belgium-LTE.csv",
        "output_js": "output/custom-network-patterns.js",
        "profile_name": "PROFILE_BelgiumLTE_car",
        "bandwidth_col_id": 2,
        "interval_sec": 1
    },
    {
        "input_csv": "input/Belgium-LTE.csv",
        "output_js": "output/custom-network-patterns.js",
        "profile_name": "PROFILE_BelgiumLTE_foot",
        "bandwidth_col_id": 3,
        "interval_sec": 1
    },
    {
        "input_csv": "input/Belgium-LTE.csv",
        "output_js": "output/custom-network-patterns.js",
        "profile_name": "PROFILE_BelgiumLTE_train",
        "bandwidth_col_id": 4,
        "interval_sec": 1
    },
    {
        "input_csv": "input/Belgium-LTE.csv",
        "output_js": "output/custom-network-patterns.js",
        "profile_name": "PROFILE_BelgiumLTE_tram",
        "bandwidth_col_id": 5,
        "interval_sec": 1
    },
    {
        "input_csv": "input/Channel_ID_low_Popularity1.csv",
        "output_js": "output/custom-network-patterns.js",
        "profile_name": "PROFILE_Twitch_Channel_Low1",
        "bandwidth_col_id": 3,
        "interval_sec": 5
    },
    {
        "input_csv": "input/Channel_ID_low_Popularity2.csv",
        "output_js": "output/custom-network-patterns.js",
        "profile_name": "PROFILE_Twitch_Channel_Low2",
        "bandwidth_col_id": 3,
        "interval_sec": 5
    },
    {
        "input_csv": "input/Channel_ID_med_Popularity1.csv",
        "output_js": "output/custom-network-patterns.js",
        "profile_name": "PROFILE_Twitch_Channel_Med1",
        "bandwidth_col_id": 3,
        "interval_sec": 5
    },
    {
        "input_csv": "input/Channel_ID_med_Popularity2.csv",
        "output_js": "output/custom-network-patterns.js",
        "profile_name": "PROFILE_Twitch_Channel_Med2",
        "bandwidth_col_id": 3,
        "interval_sec": 5
    },
    {
        "input_csv": "input/Channel_ID_high_Popularity1.csv",
        "output_js": "output/custom-network-patterns.js",
        "profile_name": "PROFILE_Twitch_Channel_High1",
        "bandwidth_col_id": 3,
        "interval_sec": 5
    },
    {
        "input_csv": "input/Channel_ID_high_Popularity2.csv",
        "output_js": "output/custom-network-patterns.js",
        "profile_name": "PROFILE_Twitch_Channel_High2",
        "bandwidth_col_id": 3,
        "interval_sec": 5
    }
]

input("Warning: All output_js files will be overwritten. Press Enter to continue..")

print("...")

# track output profiles and files for final processing
profile_in_file = {}

# delete all existing output_js files first
for profile in to_process:
    if os.path.exists(profile["output_js"]):
        os.remove(profile["output_js"])

for profile in to_process:
    # print(profile)

    # new json object for profile
    json_obj = []

    with open(profile["input_csv"], newline="") as csv_f:
        reader = csv.DictReader(csv_f)
        for row in reader:
            # print(row)
            json_obj.append({
                "speed": int(list(row.values())[profile["bandwidth_col_id"]]),
                "duration": profile["interval_sec"]
            })

    with open(profile["output_js"], "a") as output_f:
        output_f.write("const " + profile["profile_name"] + " = " + json.dumps(json_obj).replace('"', '') + ";\n\n")
    
    if profile["output_js"] not in profile_in_file:
        profile_in_file[profile["output_js"]] = [ profile["profile_name"] ] # new entry
    else:
        profile_in_file[profile["output_js"]].append(profile["profile_name"])
    
    print("Completed: " + profile["profile_name"] + " in file " + profile["output_js"])

# insert final line in js files
# e.g. "module.exports = { PROFILE_BelgiumLTE_bicycle, ... };"
for file_name, profile_list in profile_in_file.items():
    with open(file_name, "a") as output_f:
        output_f.write("module.exports = { " + ", ".join(str(p) for p in profile_list) + " };")