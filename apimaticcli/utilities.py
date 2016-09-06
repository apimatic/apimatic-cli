import os
import cgi
import requests

class Utilities:
    @classmethod
    def download_file(cls, url, output_path):
        response = requests.get(url)
        headers = cgi.parse_header(response.headers['content-disposition'])[1]
        file_name = headers['filename']
        if not os.path.exists(output_path):
            cls.create_directories(output_path)
        with open(os.path.join(output_path, file_name), 'wb') as f:
            f.write(response.content)
        return file_name

    @classmethod
    def create_directories(cls, path):
        if not os.path.exists(path):
            try:
                os.makedirs(path)
            except OSError as exc:
                if exc.errno != errno.EEXIST:
                    raise