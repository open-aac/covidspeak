Rails.application.routes.draw do
  # For details on the DSL available within this file, see http://guides.rubyonrails.org/routing.html
  root 'index#index' 
  get '/thanks' => 'index#thanks'
  get '/about' => 'index#about'
  get '/intro' => 'index#intro'
  get '/terms' => 'index#terms'
  get '/privacy' => 'index#privacy'
  get '/rooms/:room_id' => 'index#room'
  get '/rooms/:room_id/join' => 'index#join'
  get '/admin' => 'index#admin'
  
  mount ActionCable.server => '/cable'

  scope 'api/v1', module: 'api' do
    resources :rooms do
      post 'keepalive' => 'rooms#keepalive'
    end
    resources :users
    post 'tokens' => 'tokens#token'
    get 'tokens/check' => 'tokens#check_token'
    resources :accounts do
      post 'sub_ids' => 'accounts#sub_id'
    end
  end
end
