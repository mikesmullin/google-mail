import yaml from 'js-yaml';

let outputFormat = 'human';

export function setOutputFormat(format) {
    outputFormat = format === 'yaml' ? 'yaml' : 'human';
}

export function isYamlOutput() {
    return outputFormat === 'yaml';
}

export function printYaml(data) {
    const yml = yaml.dump(data, {
        indent: 2,
        lineWidth: -1,
        flowLevel: -1,
        noRefs: true,
        quotingType: '\'',
    });
    console.log(yml);
}
