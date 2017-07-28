class ArgumentAdder:
    """Adds arguments to parsers.

    This class serves as an abstraction of logic for adding
    arguments to argument parsers of the argparse library.

    Attributes:
        sdk_platforms: The supported platforms for SDK generation.
            The user is only allowed to input one of these values
            as the input of the --platform argument.
        output_formats: The supported output formats for API
            description conversions/transformations. The user is
            only allowed to input one of these values as the
            input of the --format argument.
        arguments: A dictionary of command line arguments this
            program uses and their configurations.
    """

    sdk_platforms = [
        'cs_portable_net_lib',
        'cs_net_standard_lib',
        'java_eclipse_jre_lib',
        'java_gradle_android_lib',
        'objc_cocoa_touch_ios_lib',
        'angular_javascript_lib',
        'ruby_generic_lib',
        'python_generic_lib',
        'php_generic_lib',
        'node_javascript_lib',
        'go_generic_lib'
    ]

    output_formats = [
        'APIMATIC',
        'APIBluePrint',
        'Swagger10',
        'Swagger20',
        'SwaggerYaml',
        'OpenApi3Json',
        'OpenApi3Yaml',
        'RAML',
        'RAML10',
        'Postman10',
        'Postman20',
        'WADL2009',
        'WSDL'
    ]

    arguments = {
        '--api-key': {
            'required': True,
            'help': "The API integration key from APIMatic."
        },
        '--email': {
            'required': True,
            'help': 'Your APIMatic account email address.'
        },
        '--password': {
            'required': True,
            'help': 'Your APIMatic account password.'
        },
        '--auth-key': {
            'required': True,
            'help': 'Your APIMatic account authentication key.'
        },
        '--url': {
            'default': None,
            'help': 'The URL of the API description.'
        },
        '--file': {
            'default': None,
            'help': 'The path of the API description.'
        },
        '--platform': {
            'required': True,
            'choices': sdk_platforms,
            'help': 'The platform for which the SDK needs to be generated. Options are: ' + ', '.join(sdk_platforms),
            'metavar': 'PLATFORM'
        },
        '--download-to': {
            'default': './downloads',
            'help': 'The path of the folder in which to download files. Default is ./downloads.'
        },
        '--name': {
            'required': True,
            'help': 'The name of the SDK.'
        },
        '--api': {
            'default': None,
            'help': 'The base URL of the APIMatic API.'
        },
        '--format': {
            'required': True,
            'choices': output_formats,
            'help': 'The desired output format of the API description. Options are: ' + ', '.join(output_formats),
            'metavar': 'FORMAT'
        },
        '--download-as': {
            'default': None,
            'help': 'The name of the downloaded file.'
        },
        '--skip-unzip': {
            'action': 'store_true',
            'help': 'Can be used to skip unzipping of the downloaded SDK.'
        }
    }

    @classmethod
    def add_argument(cls, obj, argument):
        """Adds an argument.

        Takes a parser or a group object and adds the argument
        to it with the options it gets from the arguments dict.

        Args:
            obj: A parser or a group object to which the argument
                is to be added.
            argument: The argument to add.
        """
        options = ArgumentAdder.arguments.get(argument)
        if options != None:
            obj.add_argument(argument, **options)

    @classmethod
    def add_arguments(cls, obj, *arguments):
        """Adds multiple arguments.

        Takes a parser or a group object and adds arguments
        to it with their options.

        Args:
            obj: A parser or a group object to which the arguments
                are to be added.
            arguments: The arguments to add.
        """
        for argument in arguments:
            ArgumentAdder.add_argument(obj, argument)

    @classmethod
    def add_auth(cls, parser):
        """Adds authentication arguments.

        Takes a parser oject and adds a group of authentication
        arguments to it. These authentication arguments are the
        user's credentials, namely the email address and the
        password.

        Args:
            parser: The parser to add the authentication
                arguments to.
        """
        group = parser.add_argument_group('Credentials', 'The credentials of your APIMatic account.')
        ArgumentAdder.add_arguments(group, '--email', '--password')

    @classmethod
    def add_input(cls, parser):
        """Adds input arguments.

        Takes a parser oject and adds a mutually exclusive group
        of input arguments to it. These mutually exclusive
        arguments are the file and url arguments. The user is only
        allowed to provide one of these to the program.

        Args:
            parser: The parser to add the input
                arguments to.
        """
        mgroup = parser.add_mutually_exclusive_group(required=True)
        ArgumentAdder.add_arguments(mgroup, '--url', '--file')
