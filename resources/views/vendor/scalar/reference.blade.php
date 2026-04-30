@extends('scalar::layout')

@section('content')
    <div id="app" data-configuration="{{ json_encode(\Scalar\Scalar::configuration()) }}"></div>

    <script nonce="{{ app('csp_nonce') }}" src="{{ \Scalar\Scalar::cdn() }}"></script>

    <script nonce="{{ app('csp_nonce') }}">
        const appElement = document.getElementById('app');
        const configuration = JSON.parse(appElement.dataset.configuration);

        Scalar.createApiReference('#app', configuration);
    </script>
@endsection
