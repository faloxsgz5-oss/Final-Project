const {withGradleProperties} = require('@expo/config-plugins');

const LOCALE_FLAGS = ['-Duser.language=en', '-Duser.country=US'];

module.exports = function withGradleLocale(config) {
  return withGradleProperties(config, configWithProperties => {
    const jvmArgs = configWithProperties.modResults.find(
      item => item.type === 'property' && item.key === 'org.gradle.jvmargs',
    );

    if (jvmArgs) {
      for (const flag of LOCALE_FLAGS) {
        if (!jvmArgs.value.includes(flag)) {
          jvmArgs.value = `${jvmArgs.value} ${flag}`;
        }
      }
    }

    return configWithProperties;
  });
};
