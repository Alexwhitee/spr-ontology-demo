import numpy as np
import math

from mpmath.functions.zeta import clsin

from .utils.slidingWindows import find_length_rank

Unsupervise_AD_Pool = []
Semisupervise_AD_Pool = [
    'MARPP'
]

def run_Unsupervise_AD(model_name, data, **kwargs):
    try:
        function_name = f'run_{model_name}'
        function_to_call = globals()[function_name]
        results = function_to_call(data, **kwargs)
        return results
    except KeyError:
        error_message = f"Model function '{function_name}' is not defined.", 
        print(error_message)
        return error_message
    except Exception as e:
        error_message = f"An error occurred while running the model '{function_name}': {str(e)}"
        print(error_message)
        return error_message


def run_Semisupervise_AD(model_name, data_train, data_test, **kwargs):
    try:
        function_name = f'run_{model_name}'
        function_to_call = globals()[function_name]

        results = function_to_call(data_train, data_test, **kwargs)
        return results
    except KeyError:
        error_message = f"Model function '{function_name}' is not defined."
        print(error_message)
        return error_message
    except Exception as e:
        error_message = f"An error occurred while running the model '{function_name}': {str(e)}"
        print(error_message)
        return error_message

def run_MARPP(data_train, data_test, save_folder, win_size=100, hidden_neurons=[64, 32],
              lr=1e-4, score_mode='mean_mse', topk_ratio=0.1):
    from .models.MARPP import AutoEncoder
    clf = AutoEncoder(
        slidingWindow=win_size,
        hidden_neurons=hidden_neurons,
        learning_rate=lr,
        batch_size=128,
        epochs=50,
        save_folder=save_folder,
        score_mode=score_mode,
        topk_ratio=topk_ratio,
    )
    clf.fit(data_train)
    score = clf.decision_function(data_test)
    return score.ravel()
