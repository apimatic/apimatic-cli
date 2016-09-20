# APIMatic CLI

[![Build Status](https://travis-ci.org/apimatic/apimatic-cli.svg?branch=master)](https://travis-ci.org/apimatic/apimatic-cli)

### Overview

This command line tool serves as a wrapper over APIMatic's Python SDK allowing API providers to generate deployment ready SDKs of their APIs for ten platforms using a single command. The following functions are supported:

 * Generate an SDK
 * Validate an API description
 * Transform an API description (not yet implemented)


### Installation

The quickest way is to install this tool as a package from pip:
```
pip install --upgrade apimatic-cli
```

If you prefer not to use pip, you can install it manually as well:

```
git clone https://github.com/apimatic/apimatic-cli.git
cd apmiatic-cli
python setup.py test
python setup.py install
```

Alternatively, you can run this tool without installation:

```
git clone https://github.com/apimatic/apimatic-cli.git
cd apmiatic-cli
pip install -r requirements.txt
```

It's highly recommended to use a [virtual enviroment](http://docs.python-guide.org/en/latest/dev/virtualenvs/) if you choose to go this way.


### Usage

If you installed using pip, you can simply invoke the tool by typing:

```
apimatic-cli -h
```

Otherwise, if you chose not to install, make sure you're in the root folder of the repository and type:

```
python -m apimaticcli -h
```

To use this tool, you have to provide two positional arguments:
* command (generate or validate)
* authentication type (fromkey or fromuser)

For information about further required or optional arguments, you can type -h as follows:

```
apimatic-cli generate fromkey -h
```

### Options

Here is a list of all available options. You're going to be using a subset of these depending on the positional arguments you use.
```
-h or --help                 Displays the help text and exists.
--api-key                    The API key of the API description obtained from APIMatic.
--platform                   The platform for which the SDK needs to be generated. It can be one of:
                             cs_portable_net_lib, java_eclipse_jre_lib, java_gradle_android_lib, 
                             objc_cocoa_touch_ios_lib, angular_javascript_lib, ruby_generic_lib,
                             python_generic_lib, php_generic_lib, node_javascript_lib, go_generic_lib
--output                     The path of the folder in which to download the SDK.
--name                       The name of the generated SDK.
--email                      The email address of the user's APIMatic account.
--password                   The password of the user's APIMatic account.
--url                        The URL of the API description.
--file                       The path of the API description file.
```

### Examples

Generate a C# SDK using an API integretation key:

```
apimatic-cli generate fromkey --api-key <your key> --platform cs_portable_net_lib --output ./SDKs
```

Generate a Python SDK using user credentials and an API description file:

```
apimatic-cli generate fromuser --email <your APIMatic account email> --password <your APIMatic account password> 
--name TestSDK --file ./data/calculator.json --platform python_generic_lib --output ./SDKs
```

Generate a Ruby SDK using user credentials and an API description URL:

```
apimatic-cli generate fromuser --email <your APIMatic account email> --password <your APIMatic account password> 
--name TestSDK --url http://www.somewebsite.com/apidescription.json --platform ruby_generic_lib  --output ./SDKs
```

Validate an API description using an API integration key:

```
apimatic-cli validate fromkey --api-key <your key>
```

Validate an API description using user credentials and an API description file:

```
apimatic-cli validate fromuser --email <your APIMatic account email> --password <your APIMatic account password> 
--file ./data/calculator.json
```

Validate an API description using user credentials and an API description URL:

```
apimatic-cli generate fromuser --email <your APIMatic account email> --password <your APIMatic account password> 
--url http://www.somewebsite.com/apidescription.json
```
