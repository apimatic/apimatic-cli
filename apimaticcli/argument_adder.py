class ArgumentAdder:
    platforms = [
        'cs_portable_net_lib', 
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
        '--url': {
            'help': 'The URL of the API description.'
        },
        '--file': {
            'help': 'The path of the API description.'
        },
        '--platform': {
            'required': True, 
            'choices': platforms, 
            'help': 'The platform for which the SDK needs to be generated. Options are: ' + ', '.join(platforms), 
            'metavar': 'PLATFORM'
        },
        '--output': {
            'default': './downloads', 
            'help': 'The path of the folder in which to download files. Default is ./downloads.'
        },
        '--name': {
            'required': True,
            'help': 'The name of the SDK.'
        }
    }

    @classmethod
    def add_argument(cls, obj, argument):
        options = ArgumentAdder.arguments.get(argument)
        if options != None:
            obj.add_argument(argument, **options)

    @classmethod
    def add_arguments(cls, obj, *arguments):
        for argument in arguments:
            ArgumentAdder.add_argument(obj, argument)
    
    @classmethod
    def add_auth(cls, parser):
        group = parser.add_argument_group('Credentials', 'The credentials of your APIMatic account.')
        ArgumentAdder.add_arguments(group, '--email', '--password')

    @classmethod
    def add_input(cls, parser):
        mgroup = parser.add_mutually_exclusive_group(required=True)
        ArgumentAdder.add_arguments(mgroup, '--url', '--file')

