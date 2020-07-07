Rails.application.routes.draw do
  # For details on the DSL available within this file, see http://guides.rubyonrails.org/routing.html
  root 'index#index' 
  get '/thanks' => 'index#thanks'
  get '/about' => 'index#about'
  get '/intro' => 'index#intro'
  get '/terms' => 'index#terms'
  get '/privacy' => 'index#privacy'
  get '/rooms/pending/:room_id' => 'index#pending_room'
  get '/rooms/:room_id' => 'index#room'
  get '/rooms/:room_id/join' => 'index#join'
  get '/schedule/:schedule_id' => 'index#schedule'
  get '/admin' => 'index#admin'
  get '/bundles/:code' => 'index#bundle'
  
  mount ActionCable.server => '/cable'

  scope 'api/v1', module: 'api' do
    resources :rooms do
      post 'keepalive' => 'rooms#keepalive'
      get 'coming' => 'rooms#user_coming'
      get 'status' => 'rooms#status'
      post 'activate' => 'rooms#activate'
    end
    resources :users
    post 'tokens' => 'tokens#token'
    post 'bundles' => 'users#bundle'
    get 'tokens/check' => 'tokens#check_token'
    resources :accounts do
      post 'sub_ids' => 'accounts#sub_id'
      post 'join_code' => 'accounts#join_code', on: :collection
      get 'rooms' => 'rooms#list_schedule'
      post 'rooms' => 'rooms#schedule'
    end
  end
end
